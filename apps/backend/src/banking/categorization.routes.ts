import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { enqueueAccountingOutbox } from "../accounting/outbox-events.js";
import { companyQuerySchema, currentAuthUser, validationError, withCompanyScope } from "../accounting/shared.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import { emitBankingSpineEvent } from "./banking-spine-emit.js";
import { pendingCategorizationPredicate } from "./pending-categorization.js";
import { maybePostBankDriverAdvanceForCategorization } from "./bank-driver-advance.service.js";
import { maybeCreateBankCategorizationDriverDeduction } from "./bank-driver-expense-deduction.service.js";
import { maybePostBankCategorizationToGl } from "./bank-feed-gl-posting.service.js";
import {
  BULK_TXN_MAX,
  bulkCategorizeTransactions,
  bulkPostTransactionsAsBills,
} from "./bulk-transactions.js";
import {
  SplitValidationError,
  commitSplit,
  getSplitLines,
  getSplitLinesByLinkage,
  saveSplitDraft,
  voidSplit,
  type SplitLineInput,
} from "./bank-transaction-splits.service.js";

const transactionIdParamsSchema = z.object({
  id: z.string().uuid(),
});

const uncategorizedQuerySchema = companyQuerySchema.extend({
  bank_account_id: z.string().uuid().optional(),
  date_from: z.string().date().optional(),
  date_to: z.string().date().optional(),
  amount_min_cents: z.coerce.number().int().optional(),
  amount_max_cents: z.coerce.number().int().optional(),
  search: z.string().trim().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const categorizeBodySchema = z.object({
  category_kind: z.string().trim().min(1).max(120),
  customer_id: z.string().uuid().optional(),
  vendor_id: z.string().uuid().optional(),
  // BLOCK-6 (additive dimension): the Driver a transaction belongs to. Stored as a TAG only; the
  // ACCOUNT chosen decides treatment (driver-advance account → recoverable receivable, behind the
  // OFF-by-default BANK_DRIVER_ADVANCE_ENABLED flag; any other account → analytics-only, stays expense).
  driver_id: z.string().uuid().optional(),
  // BLOCK-6b (additive dimensions): the Unit (truck) and the Trip (load) the transaction belongs to —
  // stored as TAGS for full cross-module linkage + drill-through. recover_from_driver + the target bucket
  // type drive the OFF-by-default driver AUTO-DEDUCTION (a fine the company paid → recovered from the
  // driver's settlement); see bank-driver-expense-deduction.service.ts.
  unit_id: z.string().uuid().optional(),
  // BANK-SPLIT-1 (Part 1 linkage): the Trailer the transaction belongs to — trailers are mdata.equipment,
  // NEVER mdata.loads.trailer_id (no such column exists). Stored as a TAG only, same as unit_id/load_id.
  trailer_id: z.string().uuid().optional(),
  load_id: z.string().uuid().optional(),
  recover_from_driver: z.boolean().optional(),
  recover_deduction_type: z.string().trim().min(1).max(40).optional(),
  gl_account_id: z.string().uuid().optional(),
  project_id: z.string().uuid().optional(),
  // Catalog-linkage (QBO parity): a CATEGORY line carries gl_account_id (Chart of Accounts); an ITEM line
  // carries item_id (Products & Services / catalogs.items) — TWO DISTINCT catalogs. Payee → vendor_id and
  // Customer → customer_id (both already accepted above) round out the four catalog links.
  item_id: z.string().uuid().optional(),
  memo: z.string().trim().max(4000).optional(),
  suggested_match_invoice_id: z.string().uuid().optional(),
  suggested_match_bill_id: z.string().uuid().optional(),
});

const bulkCategorizeBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  transaction_ids: z.array(z.string().uuid()).min(1).max(500),
  category_kind: z.string().trim().min(1).max(120),
  gl_account_id: z.string().uuid().optional(),
});

const transferBodySchema = z.object({
  destination_bank_account_id: z.string().uuid(),
  transfer_kind: z.enum(["in", "out"]),
  paired_transaction_id: z.string().uuid().optional(),
});

const skipBodySchema = z.object({
  reason: z.string().trim().min(1).max(2000),
});

const investigateBodySchema = z.object({
  note: z.string().trim().min(1).max(4000),
});

const bulkCategorizeSpecBodySchema = z.object({
  txn_ids: z.array(z.string().uuid()).min(1).max(BULK_TXN_MAX),
  ps_category: z.string().trim().min(1).max(120),
  ps_item: z.string().trim().min(1).max(200),
  qbo_account_id: z.union([z.coerce.number(), z.string().trim().min(1).max(40)]),
});

const bulkPostAsBillsBodySchema = z.object({
  txn_ids: z.array(z.string().uuid()).min(1).max(BULK_TXN_MAX),
  vendor_id: z.string().uuid().optional(),
  ps_category: z.string().trim().min(1).max(120),
  ps_item: z.string().trim().min(1).max(200),
});

// BANK-SPLIT-1 — QBO-style split-transaction popup: one bank txn -> N lines. DEFAULT mode is one vendor +
// multiple categories; a MULTIPLE VENDORS toggle allows a distinct vendor per line. Each line may also
// carry Driver/Unit/Trailer/Load links (Part 1 linkage dimensions).
const splitLineSchema = z.object({
  amount_cents: z.number().int().positive(),
  category_kind: z.string().trim().max(120).optional(),
  gl_account_id: z.string().uuid().optional(),
  vendor_id: z.string().uuid().optional(),
  customer_id: z.string().uuid().optional(),
  driver_id: z.string().uuid().optional(),
  unit_id: z.string().uuid().optional(),
  trailer_id: z.string().uuid().optional(),
  load_id: z.string().uuid().optional(),
  item_id: z.string().uuid().optional(),
  memo: z.string().trim().max(2000).optional(),
  recover_from_driver: z.boolean().optional(),
  recover_deduction_type: z.string().trim().max(40).optional(),
});

const saveSplitBodySchema = z.object({
  mode: z.enum(["single_vendor_multi_category", "multi_vendor"]),
  lines: z.array(splitLineSchema).min(2).max(50),
});

function mapSplitError(reply: FastifyReply, error: unknown) {
  if (error instanceof SplitValidationError) {
    const code = error.code === "bank_txn_not_found" ? 404 : error.code === "feature_disabled" ? 409 : 400;
    return reply.code(code).send({ error: error.code, message: error.message });
  }
  return null;
}

function mapBulkError(reply: FastifyReply, message: string) {
  if (message === "bulk_txn_limit_exceeded") return reply.code(400).send({ error: message, max: BULK_TXN_MAX });
  if (message === "bulk_txn_cross_tenant_or_missing") return reply.code(403).send({ error: message });
  if (message === "qbo_account_not_found") return reply.code(400).send({ error: message });
  if (message === "bulk_categorize_not_all_pending" || message === "bulk_post_not_all_pending") {
    return reply.code(409).send({ error: message });
  }
  if (message === "bulk_post_vendor_required" || message === "bulk_post_amount_invalid") {
    return reply.code(400).send({ error: message });
  }
  return null;
}

// BANKING-1: the For-review queue and the Banking Home UNCATEGORIZED KPI share ONE definition of
// "needs categorization" (pending-categorization.ts) so the headline count can never diverge from
// the list.
function pendingStatusesSql(): string {
  return pendingCategorizationPredicate("bt");
}

export async function registerBankTxCategorizationRoutes(app: FastifyInstance) {
  app.get("/api/v1/banking/transactions/uncategorized", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;

    const parsed = uncategorizedQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);
    const q = parsed.data;

    const payload = await withCompanyScope(user.uuid, q.operating_company_id, async (client) => {
      const where: string[] = [`bt.operating_company_id = $1`, pendingStatusesSql()];
      const values: unknown[] = [q.operating_company_id];

      if (q.bank_account_id) {
        values.push(q.bank_account_id);
        where.push(`bt.bank_account_id = $${values.length}`);
      }
      if (q.date_from) {
        values.push(q.date_from);
        where.push(`bt.transaction_date >= $${values.length}::date`);
      }
      if (q.date_to) {
        values.push(q.date_to);
        where.push(`bt.transaction_date <= $${values.length}::date`);
      }
      if (q.amount_min_cents !== undefined) {
        values.push(q.amount_min_cents);
        where.push(`bt.amount_cents >= $${values.length}`);
      }
      if (q.amount_max_cents !== undefined) {
        values.push(q.amount_max_cents);
        where.push(`bt.amount_cents <= $${values.length}`);
      }
      if (q.search) {
        values.push(`%${q.search}%`);
        const idx = values.length;
        where.push(`(bt.description ILIKE $${idx} OR bt.merchant_name ILIKE $${idx} OR bt.notes ILIKE $${idx})`);
      }

      const whereSql = where.join(" AND ");

      const totalsRes = await client.query(
        `
          SELECT
            COUNT(*)::text AS total_count,
            COALESCE(SUM(ABS(bt.amount_cents)), 0)::text AS total_uncategorized_cents
          FROM banking.bank_transactions bt
          WHERE ${whereSql}
        `,
        values
      );

      values.push(q.limit, q.offset);
      const limitIdx = values.length - 1;
      const offsetIdx = values.length;

      const rowsRes = await client.query(
        `
          SELECT
            bt.*,
            vc.vendor_category AS _vendor_category_suggestion
          FROM banking.bank_transactions bt
          LEFT JOIN LATERAL (
            SELECT v.vendor_category
            FROM mdata.vendors v
            WHERE v.operating_company_id = bt.operating_company_id
              AND v.vendor_category IS NOT NULL
              AND v.deactivated_at IS NULL
              AND (
                COALESCE(bt.description, '') ILIKE '%' || v.vendor_name || '%'
                OR COALESCE(bt.merchant_name, '') ILIKE '%' || v.vendor_name || '%'
              )
            ORDER BY length(v.vendor_name) DESC NULLS LAST
            LIMIT 1
          ) vc ON TRUE
          WHERE ${whereSql}
          ORDER BY bt.transaction_date DESC, bt.created_at DESC
          LIMIT $${limitIdx}
          OFFSET $${offsetIdx}
        `,
        values
      );

      const rows = rowsRes.rows.map((r: Record<string, unknown>) => {
        const existingRaw = r.category_kind;
        const existing =
          existingRaw != null && String(existingRaw).trim().length > 0 ? String(existingRaw).trim() : null;
        const sugRaw = r._vendor_category_suggestion;
        const sug = sugRaw != null && String(sugRaw).trim().length > 0 ? String(sugRaw).trim() : null;
        const { _vendor_category_suggestion: _omit, ...rest } = r;
        void _omit;
        return {
          ...rest,
          suggested_category_kind: existing ?? sug ?? null,
          categorization_confidence: existing ? "rule_match" : sug ? "vendor_category_fallback" : null,
        };
      });

      return {
        rows,
        total_count: Number(totalsRes.rows[0]?.total_count ?? 0),
        total_uncategorized_cents: Number(totalsRes.rows[0]?.total_uncategorized_cents ?? 0),
      };
    });

    return payload;
  });

  app.post("/api/v1/banking/transactions/:id/categorize", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;

    const params = transactionIdParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const body = categorizeBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    const companyId = query.data.operating_company_id;

    const result = await withCompanyScope(user.uuid, companyId, async (client) => {
      const txnRes = await client.query(
        `
          SELECT id, status
          FROM banking.bank_transactions
          WHERE id = $1
            AND operating_company_id = $2
          LIMIT 1
        `,
        [params.data.id, companyId]
      );
      const txn = txnRes.rows[0] as { id: string; status: string | null } | undefined;
      if (!txn) return { code: 404 as const, error: "transaction_not_found" };
      const st = String(txn.status ?? "");
      if (st !== "pending_categorization" && st !== "uncategorized") {
        return { code: 409 as const, error: "transaction_not_pending_categorization" };
      }

      const linked = body.data.customer_id ?? body.data.vendor_id ?? body.data.project_id ?? null;

      await client.query(
        `
          UPDATE banking.bank_transactions
          SET
            status = 'categorized',
            category = $2,
            category_kind = $2,
            categorization_customer_id = $3,
            categorization_vendor_id = $4,
            categorization_gl_account_id = $5,
            categorization_project_id = $6,
            categorization_memo = $7,
            suggested_match_invoice_id = $8,
            suggested_match_bill_id = $9,
            coa_account_id = COALESCE($10, coa_account_id),
            linked_entity_id = COALESCE($11, linked_entity_id),
            categorization_driver_id = COALESCE($13, categorization_driver_id),
            categorization_unit_id = COALESCE($14, categorization_unit_id),
            categorization_load_id = COALESCE($15, categorization_load_id),
            categorization_recover_from_driver = COALESCE($16, categorization_recover_from_driver),
            categorization_recover_deduction_type = COALESCE($17, categorization_recover_deduction_type),
            categorization_item_id = COALESCE($18, categorization_item_id),
            categorization_trailer_id = COALESCE($19, categorization_trailer_id),
            skip_reason = NULL,
            investigate_note = NULL,
            categorized_at = now(),
            updated_at = now()
          WHERE id = $1
            AND operating_company_id = $12
        `,
        [
          params.data.id,
          body.data.category_kind,
          body.data.customer_id ?? null,
          body.data.vendor_id ?? null,
          body.data.gl_account_id ?? null,
          body.data.project_id ?? null,
          body.data.memo ?? null,
          body.data.suggested_match_invoice_id ?? null,
          body.data.suggested_match_bill_id ?? null,
          body.data.gl_account_id ?? null,
          linked,
          companyId,
          body.data.driver_id ?? null,
          body.data.unit_id ?? null,
          body.data.load_id ?? null,
          body.data.recover_from_driver ?? null,
          body.data.recover_deduction_type ?? null,
          body.data.item_id ?? null,
          body.data.trailer_id ?? null,
        ]
      );

      await enqueueAccountingOutbox(client, companyId, "qbo.bank_transaction.categorized", "bank_transaction", params.data.id, {
        bank_transaction_id: params.data.id,
        category_kind: body.data.category_kind,
        customer_id: body.data.customer_id ?? null,
        vendor_id: body.data.vendor_id ?? null,
        gl_account_id: body.data.gl_account_id ?? null,
      });

      await appendCrudAudit(
        client,
        user.uuid,
        "banking.transaction.categorized.p6_t11204",
        {
          resource_type: "banking.bank_transactions",
          resource_id: params.data.id,
          operating_company_id: companyId,
          category_kind: body.data.category_kind,
        },
        "info",
        "P6-T11204-BANK-TX"
      );

      return { code: 200 as const, data: { ok: true } };
    });

    if ("error" in result) return reply.code(result.code).send({ error: result.error });
    void withCompanyScope(user.uuid, companyId, (client) =>
      emitBankingSpineEvent(client, {
        operating_company_id: companyId,
        actor_user_id: String(user.uuid),
        event_type: "transaction.categorized",
        entity_id: params.data.id,
        entity_type: "bank_transaction",
        source_table: "banking.bank_transactions",
        payload: { category_kind: body.data.category_kind },
      })
    ).catch((err) =>
      req.log.warn(
        { err, bank_transaction_id: params.data.id, company_id: companyId },
        "spine_emit_banking_transaction_categorized_failed"
      )
    );

    // BLOCK-6 [HOLD] — only when a Driver was tagged do we consult the driver-advance path (so callers
    // that never send driver_id get byte-identical behavior). Behind BANK_DRIVER_ADVANCE_ENABLED (OFF):
    // with the flag off this returns { posted:false, reason:"flag_off" } and posts nothing. The tag is
    // already committed above, so a non-posting outcome (expense/tag-only, or fail-closed) never loses it.
    let driverAdvance: Awaited<ReturnType<typeof maybePostBankDriverAdvanceForCategorization>> | undefined;
    if (body.data.driver_id) {
      try {
        driverAdvance = await maybePostBankDriverAdvanceForCategorization({
          companyId,
          actorUserUuid: String(user.uuid),
          actorRole: String((user as { role?: string }).role ?? ""),
          bankTransactionId: params.data.id,
          driverId: body.data.driver_id,
          glAccountId: body.data.gl_account_id ?? null,
          memo: body.data.memo ?? null,
        });
      } catch (e) {
        // Surface, never silently swallow (the tag is committed; the financial post is best-effort).
        driverAdvance = { posted: false, reason: "disburse_failed", message: String((e as Error)?.message ?? e) };
      }
    }

    // BLOCK-6b [HOLD] — driver AUTO-DEDUCTION: when the transaction is tagged to a Driver AND flagged
    // recover_from_driver (a fine/toll/citation the company paid on the driver's behalf), auto-create a
    // recoverable, bucket-charged, consent-gated pending deduction that flows into the FIN-18 settlement
    // poster (carrying load_id DIRECTLY + the source bank txn for reverse drill-through). Runs AFTER the
    // driver-advance path and cedes when the chosen account IS the driver-advance account (that path owns
    // it) so the same money is never double-booked. Behind BANK_DRIVER_EXPENSE_DEDUCTION_ENABLED (OFF):
    // with the flag off this returns { posted:false, reason:"flag_off" }. The tags are already committed.
    let driverDeduction: Awaited<ReturnType<typeof maybeCreateBankCategorizationDriverDeduction>> | undefined;
    if (body.data.driver_id && body.data.recover_from_driver) {
      try {
        driverDeduction = await maybeCreateBankCategorizationDriverDeduction({
          companyId,
          actorUserUuid: String(user.uuid),
          bankTransactionId: params.data.id,
          driverId: body.data.driver_id,
          glAccountId: body.data.gl_account_id ?? null,
          recoverFromDriver: body.data.recover_from_driver ?? false,
          recoverDeductionType: body.data.recover_deduction_type ?? null,
          loadId: body.data.load_id ?? null,
          memo: body.data.memo ?? null,
        });
      } catch (e) {
        // Surface, never silently swallow (the tags are committed; the deduction is best-effort).
        driverDeduction = { posted: false, reason: "create_failed", message: String((e as Error)?.message ?? e) };
      }
    }

    // CHAIN-05 (BLOCK-03) [HOLD] — the GENERAL case: post a direction-aware balanced JE for ANY categorized
    // line. Runs AFTER the BLOCK-6 driver-advance call (§7 ordering); its cede predicate (driver tagged +
    // the driver-advance account) returns driver_advance_branch so it NEVER re-posts a row BLOCK-6 owns.
    // Behind BANK_FEED_GL_POSTING_ENABLED (OFF): with the flag off this returns { posted:false,
    // reason:"flag_off" } and posts nothing — the tag committed above is untouched.
    let bankFeedGl: Awaited<ReturnType<typeof maybePostBankCategorizationToGl>> | undefined;
    try {
      bankFeedGl = await maybePostBankCategorizationToGl({
        companyId,
        actorUserUuid: String(user.uuid),
        bankTransactionId: params.data.id,
      });
    } catch (e) {
      // Surface, never silently swallow (the tag is committed; the financial post is best-effort).
      bankFeedGl = { posted: false, reason: "post_failed", message: String((e as Error)?.message ?? e) };
    }

    return {
      ...result.data,
      ...(driverAdvance ? { driver_advance: driverAdvance } : {}),
      ...(driverDeduction ? { driver_deduction: driverDeduction } : {}),
      ...(bankFeedGl ? { bank_feed_gl: bankFeedGl } : {}),
    };
  });

  // BLOCK-6b — FORWARD drill-through: a categorized bank transaction → its Driver / Unit / Trip(Load) tags
  // and the driver deduction it created (if any). Powers the txn detail "linked to" panel.
  app.get("/api/v1/banking/transactions/:id/categorization-links", { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;

    const params = transactionIdParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const companyId = query.data.operating_company_id;

    const payload = await withCompanyScope(user.uuid, companyId, async (client) => {
      const res = await client.query(
        `
          SELECT
            bt.id::text AS bank_transaction_id,
            bt.transaction_date::text AS transaction_date,
            bt.description,
            bt.amount_cents::bigint AS amount_cents,
            bt.is_credit,
            bt.category_kind,
            bt.categorization_driver_id::text AS driver_id,
            NULLIF(TRIM(CONCAT(d.first_name, ' ', d.last_name)), '') AS driver_name,
            bt.categorization_unit_id::text AS unit_id,
            u.unit_number AS unit_number,
            bt.categorization_trailer_id::text AS trailer_id,
            eq.equipment_number AS trailer_number,
            bt.categorization_load_id::text AS load_id,
            l.load_number AS load_number,
            bt.categorization_vendor_id::text AS vendor_id,
            ven.vendor_name AS vendor_name,
            bt.categorization_customer_id::text AS customer_id,
            cust.customer_name AS customer_name,
            bt.categorization_item_id::text AS item_id,
            itm.item_name AS item_name,
            bt.categorization_recover_from_driver AS recover_from_driver,
            bt.categorization_recover_deduction_type AS recover_deduction_type,
            bt.categorization_deduction_id::text AS deduction_id,
            ded.amount_cents::bigint AS deduction_amount_cents,
            ded.status AS deduction_status,
            ded.deduction_type AS deduction_type,
            ded.bucket_id::text AS deduction_bucket_id,
            ded.load_id::text AS deduction_load_id,
            bt.split_mode
          FROM banking.bank_transactions bt
          LEFT JOIN mdata.drivers d ON d.id = bt.categorization_driver_id
          LEFT JOIN mdata.units u ON u.id = bt.categorization_unit_id
          LEFT JOIN mdata.equipment eq ON eq.id = bt.categorization_trailer_id
          LEFT JOIN mdata.loads l ON l.id = bt.categorization_load_id
          LEFT JOIN mdata.vendors ven ON ven.id = bt.categorization_vendor_id
          LEFT JOIN mdata.customers cust ON cust.id = bt.categorization_customer_id
          LEFT JOIN catalogs.items itm ON itm.id = bt.categorization_item_id
          LEFT JOIN driver_finance.driver_settlement_deductions ded ON ded.id = bt.categorization_deduction_id
          WHERE bt.id = $1::uuid AND bt.operating_company_id = $2::uuid
          LIMIT 1
        `,
        [params.data.id, companyId]
      );
      return res.rows[0] ?? null;
    });

    if (!payload) return reply.code(404).send({ error: "transaction_not_found" });
    return payload;
  });

  // BLOCK-6b — REVERSE drill-through: given a Driver / Unit / Trip(Load), list the bank transactions tagged
  // to it (+ any deduction each created). Powers the driver / unit / load detail "linked bank expenses"
  // panels. Exactly one of driver_id / unit_id / load_id is required.
  app.get("/api/v1/banking/transactions/by-linkage", { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;

    const q = companyQuerySchema
      .extend({
        driver_id: z.string().uuid().optional(),
        unit_id: z.string().uuid().optional(),
        trailer_id: z.string().uuid().optional(),
        load_id: z.string().uuid().optional(),
        limit: z.coerce.number().int().min(1).max(500).default(200),
      })
      .safeParse(req.query ?? {});
    if (!q.success) return validationError(reply, q.error);
    const provided = [q.data.driver_id, q.data.unit_id, q.data.trailer_id, q.data.load_id].filter(Boolean);
    if (provided.length !== 1) {
      return reply
        .code(400)
        .send({ error: "exactly_one_linkage_required", detail: "provide exactly one of driver_id, unit_id, trailer_id, load_id" });
    }
    const companyId = q.data.operating_company_id;

    const rows = await withCompanyScope(user.uuid, companyId, async (client) => {
      const res = await client.query(
        `
          SELECT
            bt.id::text AS bank_transaction_id,
            bt.transaction_date::text AS transaction_date,
            bt.description,
            bt.amount_cents::bigint AS amount_cents,
            bt.is_credit,
            bt.category_kind,
            bt.categorization_driver_id::text AS driver_id,
            bt.categorization_unit_id::text AS unit_id,
            bt.categorization_trailer_id::text AS trailer_id,
            bt.categorization_load_id::text AS load_id,
            bt.categorization_recover_from_driver AS recover_from_driver,
            bt.categorization_deduction_id::text AS deduction_id,
            ded.amount_cents::bigint AS deduction_amount_cents,
            ded.status AS deduction_status,
            ded.deduction_type AS deduction_type
          FROM banking.bank_transactions bt
          LEFT JOIN driver_finance.driver_settlement_deductions ded ON ded.id = bt.categorization_deduction_id
          WHERE bt.operating_company_id = $1::uuid
            AND (
              ($2::uuid IS NOT NULL AND bt.categorization_driver_id = $2::uuid)
              OR ($3::uuid IS NOT NULL AND bt.categorization_unit_id = $3::uuid)
              OR ($4::uuid IS NOT NULL AND bt.categorization_load_id = $4::uuid)
              OR ($6::uuid IS NOT NULL AND bt.categorization_trailer_id = $6::uuid)
            )
          ORDER BY bt.transaction_date DESC, bt.created_at DESC
          LIMIT $5
        `,
        [companyId, q.data.driver_id ?? null, q.data.unit_id ?? null, q.data.load_id ?? null, q.data.limit, q.data.trailer_id ?? null]
      );
      return res.rows;
    });

    return { rows, total_count: rows.length };
  });

  app.post("/api/v1/banking/transactions/categorize-bulk", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;

    const body = bulkCategorizeBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    const result = await withCompanyScope(user.uuid, body.data.operating_company_id, async (client) => {
      let categorized = 0;
      const errors: Array<{ transaction_id: string; error: string }> = [];

      for (const id of body.data.transaction_ids) {
        try {
          const res = await client.query(
            `
              UPDATE banking.bank_transactions
              SET
                status = 'categorized',
                category = $2,
                category_kind = $2,
                categorization_gl_account_id = COALESCE($3, categorization_gl_account_id),
                coa_account_id = COALESCE($3, coa_account_id),
                categorized_at = now(),
                updated_at = now(),
                skip_reason = NULL,
                investigate_note = NULL
              WHERE id = $1
                AND operating_company_id = $4
                AND (status = 'pending_categorization' OR status = 'uncategorized')
              RETURNING id
            `,
            [id, body.data.category_kind, body.data.gl_account_id ?? null, body.data.operating_company_id]
          );
          if (!res.rows[0]) {
            errors.push({ transaction_id: id, error: "not_pending_or_missing" });
            continue;
          }
          categorized += 1;
          await enqueueAccountingOutbox(
            client,
            body.data.operating_company_id,
            "qbo.bank_transaction.categorized",
            "bank_transaction",
            id,
            {
              bank_transaction_id: id,
              category_kind: body.data.category_kind,
              bulk: true,
            }
          );
        } catch (e) {
          errors.push({ transaction_id: id, error: String((e as Error)?.message ?? "update_failed") });
        }
      }

      return { categorized_count: categorized, errors };
    });

    return result;
  });

  app.post("/api/v1/banking/transactions/:id/transfer", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;

    const params = transactionIdParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const body = transferBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    const companyId = query.data.operating_company_id;

    const result = await withCompanyScope(user.uuid, companyId, async (client) => {
      const txnRes = await client.query(
        `
          SELECT status
          FROM banking.bank_transactions
          WHERE id = $1 AND operating_company_id = $2
          LIMIT 1
        `,
        [params.data.id, companyId]
      );
      const txn = txnRes.rows[0] as { status: string | null } | undefined;
      if (!txn) return { code: 404 as const, error: "transaction_not_found" };
      const st = String(txn.status ?? "");
      if (st !== "pending_categorization" && st !== "uncategorized") {
        return { code: 409 as const, error: "transaction_not_pending_categorization" };
      }

      await client.query(
        `
          UPDATE banking.bank_transactions
          SET
            status = 'transfer',
            category = 'transfer',
            category_kind = 'transfer',
            destination_bank_account_id = $2,
            transfer_kind = $3,
            paired_transaction_id = $4,
            categorized_at = now(),
            updated_at = now(),
            skip_reason = NULL,
            investigate_note = NULL
          WHERE id = $1
            AND operating_company_id = $5
        `,
        [params.data.id, body.data.destination_bank_account_id, body.data.transfer_kind, body.data.paired_transaction_id ?? null, companyId]
      );

      if (body.data.paired_transaction_id) {
        await client.query(
          `
            UPDATE banking.bank_transactions
            SET
              status = 'transfer',
              category = 'transfer',
              category_kind = 'transfer',
              paired_transaction_id = $1,
              categorized_at = now(),
              updated_at = now()
            WHERE id = $2
              AND operating_company_id = $3
          `,
          [params.data.id, body.data.paired_transaction_id, companyId]
        );
      }

      await enqueueAccountingOutbox(client, companyId, "qbo.bank_transaction.categorized", "bank_transaction", params.data.id, {
        bank_transaction_id: params.data.id,
        category_kind: "transfer",
        transfer_kind: body.data.transfer_kind,
        paired_transaction_id: body.data.paired_transaction_id ?? null,
      });

      await appendCrudAudit(client, user.uuid, "banking.transaction.transfer.p6_t11204", {
        resource_type: "banking.bank_transactions",
        resource_id: params.data.id,
        operating_company_id: companyId,
      });

      return { code: 200 as const, data: { ok: true } };
    });

    if ("error" in result) return reply.code(result.code).send({ error: result.error });
    return result.data;
  });

  app.post("/api/v1/banking/transactions/:id/skip", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;

    const params = transactionIdParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const body = skipBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    const companyId = query.data.operating_company_id;

    const res = await withCompanyScope(user.uuid, companyId, async (client) => {
      const upd = await client.query(
        `
          UPDATE banking.bank_transactions
          SET
            status = 'skipped',
            category = 'skipped',
            skip_reason = $3,
            categorized_at = now(),
            updated_at = now()
          WHERE id = $1
            AND operating_company_id = $2
            AND (status = 'pending_categorization' OR status = 'uncategorized')
          RETURNING id
        `,
        [params.data.id, companyId, body.data.reason]
      );
      if (!upd.rows[0]) return { ok: false as const };
      await appendCrudAudit(client, user.uuid, "banking.transaction.skipped.p6_t11204", {
        resource_type: "banking.bank_transactions",
        resource_id: params.data.id,
        operating_company_id: companyId,
      });
      return { ok: true as const };
    });

    if (!res.ok) return reply.code(404).send({ error: "transaction_not_found" });
    void withCompanyScope(user.uuid, companyId, (client) =>
      emitBankingSpineEvent(client, {
        operating_company_id: companyId,
        actor_user_id: String(user.uuid),
        event_type: "transaction.skipped",
        entity_id: params.data.id,
        entity_type: "bank_transaction",
        source_table: "banking.bank_transactions",
      })
    ).catch((err) =>
      req.log.warn(
        { err, bank_transaction_id: params.data.id, company_id: companyId },
        "spine_emit_banking_transaction_skipped_failed"
      )
    );
    return { ok: true };
  });

  app.post("/api/v1/banking/transactions/:id/investigate", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;

    const params = transactionIdParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const body = investigateBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    const companyId = query.data.operating_company_id;

    const res = await withCompanyScope(user.uuid, companyId, async (client) => {
      const upd = await client.query(
        `
          UPDATE banking.bank_transactions
          SET
            status = 'investigating',
            category = 'investigating',
            investigate_note = $3,
            updated_at = now()
          WHERE id = $1
            AND operating_company_id = $2
            AND (status = 'pending_categorization' OR status = 'uncategorized')
          RETURNING id
        `,
        [params.data.id, companyId, body.data.note]
      );
      if (!upd.rows[0]) return { ok: false as const };
      await appendCrudAudit(client, user.uuid, "banking.transaction.investigating.p6_t11204", {
        resource_type: "banking.bank_transactions",
        resource_id: params.data.id,
        operating_company_id: companyId,
      });
      return { ok: true as const };
    });

    if (!res.ok) return reply.code(404).send({ error: "transaction_not_found" });
    void withCompanyScope(user.uuid, companyId, (client) =>
      emitBankingSpineEvent(client, {
        operating_company_id: companyId,
        actor_user_id: String(user.uuid),
        event_type: "transaction.investigate_flagged",
        entity_id: params.data.id,
        entity_type: "bank_transaction",
        source_table: "banking.bank_transactions",
      })
    ).catch((err) =>
      req.log.warn(
        { err, bank_transaction_id: params.data.id, company_id: companyId },
        "spine_emit_banking_transaction_investigate_flagged_failed"
      )
    );
    return { ok: true };
  });

  app.post("/api/v1/banking/transactions/bulk-categorize", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;

    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const body = bulkCategorizeSpecBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    try {
      const result = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) =>
        bulkCategorizeTransactions(client, {
          operatingCompanyId: query.data.operating_company_id,
          txnIds: body.data.txn_ids,
          psCategory: body.data.ps_category,
          psItem: body.data.ps_item,
          qboAccountId: body.data.qbo_account_id,
        })
      );
      return { ok: true, updated_count: result.updated_count };
    } catch (error) {
      const message = String((error as Error)?.message ?? "bulk_categorize_failed");
      const mapped = mapBulkError(reply, message);
      if (mapped) return mapped;
      throw error;
    }
  });

  app.post("/api/v1/banking/transactions/bulk-post-as-bills", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;

    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const body = bulkPostAsBillsBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    try {
      const result = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) =>
        bulkPostTransactionsAsBills(
          client,
          {
            operatingCompanyId: query.data.operating_company_id,
            txnIds: body.data.txn_ids,
            vendorId: body.data.vendor_id,
            psCategory: body.data.ps_category,
            psItem: body.data.ps_item,
          },
          user.uuid
        )
      );
      return { ok: true, bill_ids: result.bill_ids, created_count: result.bill_ids.length };
    } catch (error) {
      const message = String((error as Error)?.message ?? "bulk_post_failed");
      const mapped = mapBulkError(reply, message);
      if (mapped) return mapped;
      throw error;
    }
  });

  // ── BANK-SPLIT-1 — Split-transaction popup (real, persisted; replaces the honest 501 stub) ─────────────
  app.get("/api/v1/banking/transactions/:id/splits", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const params = transactionIdParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    try {
      const payload = await getSplitLines(query.data.operating_company_id, user.uuid, params.data.id);
      return payload;
    } catch (error) {
      const mapped = mapSplitError(reply, error);
      if (mapped) return mapped;
      throw error;
    }
  });

  app.put("/api/v1/banking/transactions/:id/splits", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const params = transactionIdParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const body = saveSplitBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    try {
      const result = await saveSplitDraft(
        query.data.operating_company_id,
        user.uuid,
        params.data.id,
        body.data.mode,
        body.data.lines as SplitLineInput[]
      );
      return result;
    } catch (error) {
      const mapped = mapSplitError(reply, error);
      if (mapped) return mapped;
      throw error;
    }
  });

  app.post("/api/v1/banking/transactions/:id/splits/commit", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const params = transactionIdParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    try {
      const result = await commitSplit(
        query.data.operating_company_id,
        user.uuid,
        String((user as { role?: string }).role ?? ""),
        params.data.id
      );
      return result;
    } catch (error) {
      const mapped = mapSplitError(reply, error);
      if (mapped) return mapped;
      throw error;
    }
  });

  // REVERSE drill-through: given a Driver/Unit/Trailer/Trip(Load)/Vendor, list the split lines tagged to it
  // (+ their parent bank txn + whatever each line produced — advance/deduction/bill). Exactly one linkage
  // param required, mirroring the single-line by-linkage endpoint above (BLOCK-6b), generalized to splits.
  app.get("/api/v1/banking/transaction-splits/by-linkage", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const q = companyQuerySchema
      .extend({
        driver_id: z.string().uuid().optional(),
        unit_id: z.string().uuid().optional(),
        trailer_id: z.string().uuid().optional(),
        load_id: z.string().uuid().optional(),
        vendor_id: z.string().uuid().optional(),
        limit: z.coerce.number().int().min(1).max(500).default(200),
      })
      .safeParse(req.query ?? {});
    if (!q.success) return validationError(reply, q.error);
    const provided = [q.data.driver_id, q.data.unit_id, q.data.trailer_id, q.data.load_id, q.data.vendor_id].filter(Boolean);
    if (provided.length !== 1) {
      return reply.code(400).send({
        error: "exactly_one_linkage_required",
        detail: "provide exactly one of driver_id, unit_id, trailer_id, load_id, vendor_id",
      });
    }
    const rows = await getSplitLinesByLinkage(
      q.data.operating_company_id,
      user.uuid,
      {
        driver_id: q.data.driver_id,
        unit_id: q.data.unit_id,
        trailer_id: q.data.trailer_id,
        load_id: q.data.load_id,
        vendor_id: q.data.vendor_id,
      },
      q.data.limit
    );
    return { rows, total_count: rows.length };
  });

  app.post("/api/v1/banking/transactions/:id/splits/void", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const params = transactionIdParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    try {
      const result = await voidSplit(query.data.operating_company_id, user.uuid, params.data.id);
      return result;
    } catch (error) {
      const mapped = mapSplitError(reply, error);
      if (mapped) return mapped;
      throw error;
    }
  });
}
