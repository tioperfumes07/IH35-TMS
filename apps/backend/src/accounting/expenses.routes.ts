import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { correctPostedExpense, CORRECTABLE_EXPENSE_FIELDS, ExpenseCorrectionRefused } from "./expense-correction.service.js";
import { EXPENSE_LOAD_MISMATCH_ERROR, type ExpenseLoadMismatch } from "./expense-load-attribution.js";
import { EXPENSE_MATCHED_BANK_TRANSACTION_ID_SQL } from "./expense-bank-match-sql.js";
import fp from "fastify-plugin";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { reassignDraftAttachments } from "../documents/attachments.service.js";
import { companyQuerySchema, currentAuthUser, validationError, withCompanyScope } from "../accounting/shared.js";
import { attributeExpenseToLoad } from "../expense-attribution/attribute.service.js";
import { resolveLineLoadExemption } from "./expense-line-load-exemption.js";
import { generateExpenseNumber, insertExpenseLoadLink } from "../expense-attribution/expense-number.js";
import { ExpenseLoadLinkBackfillError, linkExpensesToLoads, refuseNonOwnerExpenseLoadLink } from "./expense-load-link-backfill.service.js";
import { emitAccountingSpineEvent } from "./accounting-spine-emit.js";
import { resolveExpenseCategoryId } from "./expense-category-catalog.js";
import { postSourceTransaction, postSourceTransactionInClientTx, reversePostedSourceTransactionInClientTx, PostingEngineError, ensureOpenPeriod } from "./posting-engine.service.js";
import { createJournalEntryOnClient } from "./journal-entries.service.js";
import { openAndRunIntake } from "../driver-finance/feed-gate/feed-gate.service.js";

import { todayIso } from "./void.service.js";
import { voidExpenseDocumentInClientTx } from "./expense-void.service.js";
import { canVoid, isVoidEnforcementEnabled } from "./void.service.js";
import { canVoidCancel } from "../lib/authz/void-cancel-authz.js";
import { isEnabled } from "../lib/feature-flags/service.js";
import { listExpenseDuplicateGroups } from "./expense-duplicate.service.js";
import { nextExpenseDisplayId } from "./display-id.js";
import { parseOperatorDocumentNumber, suggestFromLastSaved } from "../lib/qbo-custom-document-number.js";
import { buildListSearchClause, expenseListSearchFields } from "../lib/list-search/build-list-search.js";
import {
  reinstateDocumentThenVoidReversal,
  ReinstateDocumentError,
} from "./reinstate-document.service.js";

import { EXPENSE_GL_POSTING_FLAG_KEY } from "./expense-gl-posting-flag.js";
import { columnExists, createExpenseBodySchema, createExpenseInClientTx, emitOutbox, ExpensePostRefused, FIXED_COST_CATEGORY_CODES, insertUnattributedAlert, relationExists, type CreateExpenseBody } from "./expense-writer.service.js";
export { createExpenseInClientTx, type CreateExpenseBody } from "./expense-writer.service.js";
export { EXPENSE_GL_POSTING_FLAG_KEY } from "./expense-gl-posting-flag.js";

function accountingRoles(role: string) {
  return ["Owner", "Administrator", "Accountant"].includes(role);
}

const reattributeBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  new_load_id: z.string().uuid(),
  reason: z.string().trim().min(5).max(500),
});

// GAP-EXPENSES browse (read-only): GET list query. status values match the header CHECK
// (accounting.expenses.status IN ('draft','posted','void')); date filters read transaction_date.
const listExpensesQuerySchema = companyQuerySchema.extend({
  // FLT-03 — "active" = hide voided (default); exact draft|posted|void still allowed; omit = all.
  status: z.enum(["draft", "posted", "void", "active"]).optional(),
  date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  load_id: z.string().uuid().optional(),
  driver_id: z.string().uuid().optional(),
  vendor_uuid: z.string().uuid().optional(),
  // EXPENSE-FUEL-TRAILER-LIST-FILTER-MISSING (CC-2 finding #6337) — trailer_id is a real, populated
  // column since rank 1 (PR #6316) and the create/detail paths already accept it (rank 4, PR #6322);
  // the list endpoint never did. Mirrors #6324's accident list filter exactly.
  trailer_id: z.string().uuid().optional(),
  // ACCT-F5032 — unit_id is written on create and returned on detail, but list had no filter so
  // VehicleProfile could not mount ExpensesReverseSection (fuel already filters by unit_id).
  unit_id: z.string().uuid().optional(),
  // ACCT-F5033 — linked_work_order_uuid written on create; list filter required for WO reverse.
  work_order_id: z.string().uuid().optional(),
  // ACCT-F5034 — insurance_claim_id written on create; list filter for ClaimsTab ExpensesReverseSection.
  insurance_claim_id: z.string().uuid().optional(),
  search: z.string().trim().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const expenseIdParamSchema = z.object({ id: z.string().uuid() });

export type ExpenseListFilters = {
  status?: "draft" | "posted" | "void" | "active";
  dateFrom?: string;
  dateTo?: string;
  loadId?: string;
  driverId?: string;
  vendorUuid?: string;
  trailerId?: string;
  unitId?: string;
  workOrderId?: string;
  insuranceClaimId?: string;
  search?: string;
  limit: number;
  offset: number;
};

export type ExpenseListRow = {
  id: string;
  expense_number: string | null;
  vendor_document_number: string | null;
  transaction_date: string;
  total_amount_cents: string;
  status: string;
  posting_status: string;
  memo: string | null;
  // REG-PARSE-DATA (ROUND 11, additive, 2026-09-06) — structured fields the seed's composite memo
  // string parsed to for display only; the register reads these first, the parser is fallback-only.
  merchant_address: string | null;
  source_settlement_ref: string | null;
  load_id: string | null;
  vendor_uuid: string | null;
  driver_uuid: string | null;
  trailer_id: string | null;
  trailer_display_id: string | null;
  unit_id: string | null;
  unit_display_id: string | null;
  created_at: string;
  vendor_name: string | null;
  driver_first_name: string | null;
  driver_last_name: string | null;
  load_number: string | null;
  line_description: string | null;
  is_reconciled: boolean;
  journal_entry_id: string | null;
  // CLS-LINKAGE-ONEWAY instance (Expense -> JE, list view) — accounting.journal_entries has no
  // number/ref/doc column; memo IS the JE's human identity. Named journal_entry_memo (not bare
  // memo, which this row already uses for the expense's OWN memo) to match the expense DETAIL
  // route's existing field name for the identical value (expenses.routes.ts's header query already
  // selects je.memo AS journal_entry_memo — this list query just never joined journal_entries at all).
  journal_entry_memo: string | null;
  linked_work_order_uuid: string | null;
  work_order_display_id: string | null;
  /** ACCT-F17 — bank txn stamped via matched_expense_id (Law §9 reverse). */
  matched_bank_transaction_id: string | null;
  matched_bank_transaction_description: string | null;
};


const EXPENSE_MATCHED_BANK_TRANSACTION_LABEL_SQL = `
  (
    SELECT COALESCE(NULLIF(bt.merchant_name, ''), NULLIF(bt.description, ''))
    FROM banking.bank_transactions bt
    WHERE bt.operating_company_id = e.operating_company_id
      AND bt.matched_expense_id = e.id
    ORDER BY bt.transaction_date DESC, bt.created_at DESC
    LIMIT 1
  )
`;

/**
 * READ-ONLY expenses list query (GAP-EXPENSES browse). SELECT only — no writes.
 * Entity-scoped by an explicit operating_company_id filter (the caller also SETs
 * app.operating_company_id via withCompanyScope so RLS agrees). is_reconciled is derived
 * from a REAL EXISTS against banking.reconciliation_matches (ledger_entry_kind='expense'),
 * following the #1755 Bills/Bill-Payments reconciliation-status precedent; 'rejected' is
 * excluded (the only non-active match_state on that table). LEFT JOINs never drop a row.
 */
export async function queryExpensesList(
  client: { query: (sql: string, values?: unknown[]) => Promise<{ rows: ExpenseListRow[] }> },
  operatingCompanyId: string,
  filters: ExpenseListFilters
): Promise<ExpenseListRow[]> {
  const values: unknown[] = [operatingCompanyId];
  const where: string[] = ["e.operating_company_id = $1::uuid"];
  if (filters.status === "active") {
    // FLT-03 — hide voided by default (Payments status=active pattern).
    where.push(`e.status <> 'void'`);
  } else if (filters.status) {
    values.push(filters.status);
    where.push(`e.status = $${values.length}`);
  }
  if (filters.dateFrom) {
    values.push(filters.dateFrom);
    where.push(`e.transaction_date >= $${values.length}::date`);
  }
  if (filters.dateTo) {
    values.push(filters.dateTo);
    where.push(`e.transaction_date <= $${values.length}::date`);
  }
  if (filters.loadId) {
    values.push(filters.loadId);
    where.push(`e.load_id = $${values.length}::uuid`);
  }
  if (filters.driverId) {
    values.push(filters.driverId);
    where.push(`e.driver_uuid = $${values.length}::uuid`);
  }
  if (filters.vendorUuid) {
    values.push(filters.vendorUuid);
    where.push(`e.vendor_uuid = $${values.length}::uuid`);
  }
  if (filters.trailerId) {
    values.push(filters.trailerId);
    where.push(`e.trailer_id = $${values.length}::uuid`);
  }
  if (filters.unitId) {
    values.push(filters.unitId);
    where.push(`e.unit_id = $${values.length}::uuid`);
  }
  if (filters.workOrderId) {
    values.push(filters.workOrderId);
    where.push(`e.linked_work_order_uuid = $${values.length}::uuid`);
  }
  if (filters.insuranceClaimId) {
    values.push(filters.insuranceClaimId);
    where.push(`e.insurance_claim_id = $${values.length}::uuid`);
  }
  if (filters.search) {
    const clause = buildListSearchClause({
      search: filters.search,
      values,
      fields: expenseListSearchFields({
        vendorNameExpr:
          "COALESCE(v.vendor_name, mdata.resolve_vendor_label_same_company(e.vendor_uuid, e.operating_company_id))",
      }),
    });
    if (clause) where.push(clause);
  }
  values.push(filters.limit);
  const limitIdx = values.length;
  values.push(filters.offset);
  const offsetIdx = values.length;

  const res = await client.query(
    `
      SELECT
        e.id::text                                   AS id,
        e.expense_number                             AS expense_number,
        e.vendor_document_number                     AS vendor_document_number,
        e.transaction_date                           AS transaction_date,
        e.total_amount_cents::text                   AS total_amount_cents,
        e.status                                     AS status,
        e.posting_status                             AS posting_status,
        e.posting_hold_reason                        AS posting_hold_reason,
        e.memo                                       AS memo,
        -- REG-PARSE-DATA (ROUND 11, additive, 2026-09-06) — structured fields backfilled from the
        -- seed's composite memo string; the register reads these first, parser is fallback-only.
        e.merchant_address                           AS merchant_address,
        e.source_settlement_ref                      AS source_settlement_ref,
        e.load_id::text                              AS load_id,
        e.vendor_uuid::text                          AS vendor_uuid,
        e.driver_uuid::text                          AS driver_uuid,
        -- U16 (owner) — work order, unit and trailer on every expense list: the expense's own, else the one value all of
        -- its lines carry (expense_lines hold unit / trailer / work order too).
        COALESCE(e.trailer_id, line_dims.trailer_id)::text AS trailer_id,
        tr.equipment_number                          AS trailer_display_id,
        COALESCE(e.unit_id, line_dims.unit_id)::text AS unit_id,
        un.unit_number                               AS unit_display_id,
        e.journal_entry_id::text                     AS journal_entry_id,
        je.memo                                       AS journal_entry_memo,
        COALESCE(e.linked_work_order_uuid, line_dims.work_order_id)::text AS linked_work_order_uuid,
        e.created_at                                 AS created_at,
        -- ACCT-EXPENSES-VENDOR-DEACTIVATED-TOMBSTONE: mdata.vendors' RLS policy hard-excludes any
        -- row with deactivated_at IS NOT NULL for a non-bypass reader, so a plain join silently
        -- returns NULL for vendor_name even when e.vendor_uuid is a perfectly valid FK — the vendor
        -- just went inactive since. Same class already fixed for invoices/ap-aging/parts-inventory
        -- (mdata.resolve_vendor_label_same_company, migration 202612780000) — this surface was the
        -- swept gap (confirmed absent from verify-deactivated-counterparty-resolver-coverage.mjs's
        -- own coverage list).
        COALESCE(v.vendor_name, mdata.resolve_vendor_label_same_company(e.vendor_uuid, e.operating_company_id)) AS vendor_name,
        dr.first_name                                AS driver_first_name,
        dr.last_name                                 AS driver_last_name,
        l.load_number                                AS load_number,
        wo.display_id                                AS work_order_display_id,
        (
          SELECT el.description
          FROM accounting.expense_lines el
          WHERE el.expense_id = e.id
          ORDER BY el.line_sequence
          LIMIT 1
        )                                            AS line_description,
        EXISTS (
          SELECT 1
          FROM banking.reconciliation_matches rm
          WHERE rm.ledger_entry_kind = 'expense'
            AND rm.ledger_entry_id = e.id
            AND rm.operating_company_id = e.operating_company_id
            AND rm.match_state IN ('auto_matched', 'user_matched')
        )                                            AS is_reconciled,
        ${EXPENSE_MATCHED_BANK_TRANSACTION_ID_SQL}   AS matched_bank_transaction_id,
        ${EXPENSE_MATCHED_BANK_TRANSACTION_LABEL_SQL} AS matched_bank_transaction_description,
        -- LDT-1 (2026-09-06, lead): the Load Costs cards render Paid-with, Category and the receipt count
        -- straight from this list — no second read path. Additive columns, nullable, no filter change.
        pa.account_number                            AS payment_account_number,
        pa.account_name                              AS payment_account_name,
        ca.account_number                            AS category_account_number,
        ca.account_name                              AS category_account_name,
        (
          SELECT COUNT(*)::int
          FROM documents.attachments att
          WHERE att.operating_company_id = e.operating_company_id
            AND att.entity_type = 'expense'
            AND att.entity_id = e.id
            AND att.is_deleted = false
        )                                            AS attachment_count
      FROM accounting.expenses e
      LEFT JOIN mdata.vendors v ON v.id = e.vendor_uuid AND v.operating_company_id = e.operating_company_id
      LEFT JOIN catalogs.accounts pa ON pa.id = e.payment_account_uuid AND pa.operating_company_id = e.operating_company_id
      LEFT JOIN LATERAL (
        SELECT acc.account_number, acc.account_name
        FROM accounting.expense_lines el
        JOIN catalogs.accounts acc ON acc.id = el.expense_account_uuid
        WHERE el.expense_id = e.id
        ORDER BY el.line_sequence ASC
        LIMIT 1
      ) ca ON true
      LEFT JOIN mdata.drivers dr ON dr.id = e.driver_uuid AND dr.operating_company_id = e.operating_company_id
      LEFT JOIN mdata.loads l ON l.id = e.load_id AND l.operating_company_id = e.operating_company_id
      LEFT JOIN LATERAL (
        SELECT CASE WHEN count(DISTINCT el_dim.unit_id) = 1 THEN (array_agg(el_dim.unit_id) FILTER (WHERE el_dim.unit_id IS NOT NULL))[1] END AS unit_id,
               CASE WHEN count(DISTINCT el_dim.trailer_id) = 1 THEN (array_agg(el_dim.trailer_id) FILTER (WHERE el_dim.trailer_id IS NOT NULL))[1] END AS trailer_id,
               CASE WHEN count(DISTINCT COALESCE(el_dim.linked_work_order_uuid, wol.work_order_uuid)) = 1
                    THEN (array_agg(COALESCE(el_dim.linked_work_order_uuid, wol.work_order_uuid))
                            FILTER (WHERE COALESCE(el_dim.linked_work_order_uuid, wol.work_order_uuid) IS NOT NULL))[1] END AS work_order_id
          FROM accounting.expense_lines el_dim
          LEFT JOIN maintenance.work_order_lines wol ON wol.uuid = el_dim.linked_wo_line_uuid
         WHERE el_dim.expense_id = e.id
      ) line_dims ON true
      LEFT JOIN mdata.equipment tr ON tr.id = COALESCE(e.trailer_id, line_dims.trailer_id)
        AND (tr.owner_company_id = e.operating_company_id OR tr.currently_leased_to_company_id = e.operating_company_id)
      LEFT JOIN mdata.units un ON un.id = COALESCE(e.unit_id, line_dims.unit_id)
      LEFT JOIN maintenance.work_orders wo
        ON wo.id = COALESCE(e.linked_work_order_uuid, line_dims.work_order_id)
       AND wo.operating_company_id = e.operating_company_id
      LEFT JOIN accounting.journal_entries je ON je.id = e.journal_entry_id AND je.operating_company_id = e.operating_company_id
      WHERE ${where.join(" AND ")}
      ORDER BY e.transaction_date DESC, e.created_at DESC
      LIMIT $${limitIdx} OFFSET $${offsetIdx}
    `,
    values
  );
  return res.rows;
}

/** ROUND 443.13 (CC-1) — transactional expense creation extracted from POST /api/v1/expenses so
 * programmatic callers (Settlement Creator, seed scripts) can reuse the full stampings without
 * an HTTP round-trip. The route handler calls this inside `withCompanyScope`.
 *
 * Returns a discriminated union: check for sentinel keys (`unavailable`, `unitIdRequired`, …)
 * before accessing the success shape (`expense_id`, `expense_number`, …). Never throws HTTP
 * errors — those are handled by the route after inspecting the return value.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any

// LEAD 443.112 #1 — Owner backfill of expense load links. Dry run unless asked.
const linkLoadsBodySchema = z.object({
  dry_run: z.boolean().optional().default(true),
});

export async function registerExpenseRoutes(app: FastifyInstance) {
  // GAP-EXPENSES browse side (READ-ONLY). Paginated list of accounting.expenses for the Expenses
  // list screen. STRICTLY read-only — SELECT only, no INSERT/UPDATE/DELETE. Mirrors the read-only
  // reconciliation-status precedent of PR #1755 (Bills/Bill-Payments lists): a Bank Match is derived
  // via an EXISTS against banking.reconciliation_matches (ledger_entry_kind='expense', added by
  // 202607011600_bank_recon_expense_match_part2a.sql), never a hardcoded value. Entity-scoped through
  // withCompanyScope (SET app.operating_company_id → RLS) + an explicit operating_company_id filter.
  // Only real columns from 202606151300_expenses_header_phase1_foundation.sql are read.
  app.get("/api/v1/expenses", { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } }, async (req: FastifyRequest, reply: FastifyReply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!accountingRoles(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });

    const parsed = listExpensesQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);
    const q = parsed.data;

    const result = await withCompanyScope(String(user.uuid), q.operating_company_id, async (client) => {
      // Guard like the create handler: if the header table isn't present (fresh/partial schema),
      // return an empty browse rather than 500 — read-only, non-breaking.
      if (!(await relationExists(client, "accounting.expenses"))) {
        return { unavailable: true as const };
      }

      const rows = await queryExpensesList(client, q.operating_company_id, {
        status: q.status,
        dateFrom: q.date_from,
        dateTo: q.date_to,
        loadId: q.load_id,
        driverId: q.driver_id,
        vendorUuid: q.vendor_uuid,
        trailerId: q.trailer_id,
        unitId: q.unit_id,
        workOrderId: q.work_order_id,
        insuranceClaimId: q.insurance_claim_id,
        search: q.search,
        limit: q.limit,
        offset: q.offset,
      });
      // R-102-B item 5 ("DEFAULT FILTERS" — owner, ROUND 121: "a list that silently hides is the
      // same class of defect as a badge that never renders"). Company-wide voided count, same
      // simple scope as the packet's own example ("81 live, 38 voided") — discloses what
      // "Active (hide voided)" is hiding.
      const voidedCountRes = await client.query(
        `SELECT COUNT(*)::int AS n FROM accounting.expenses WHERE operating_company_id = $1::uuid AND (voided_at IS NOT NULL OR status = 'void')`,
        [q.operating_company_id]
      );
      const voidedCount = Number((voidedCountRes.rows[0] as { n?: number } | undefined)?.n ?? 0);
      return { rows, voidedCount };
    });

    if ("unavailable" in result) return reply.code(200).send({ rows: [], voided_count: 0 });
    return reply.code(200).send({ rows: result.rows, voided_count: result.voidedCount });
  });

  // ACCT-R-17 — duplicate expense fingerprint groups (READ-ONLY). Must register before /:id.
  app.get(
    "/api/v1/expenses/duplicates",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const user = currentAuthUser(req, reply);
      if (!user) return;
      if (!accountingRoles(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });

      const parsed = companyQuerySchema
        .extend({ limit: z.coerce.number().int().min(1).max(200).default(50), vendor_id: z.string().uuid().optional() })
        .safeParse(req.query ?? {});
      if (!parsed.success) return validationError(reply, parsed.error);

      return withCompanyScope(String(user.uuid), parsed.data.operating_company_id, async (client) => {
        if (!(await relationExists(client, "accounting.expenses"))) {
          return { group_count: 0, expense_count: 0, groups: [] };
        }
        return listExpenseDuplicateGroups(client, parsed.data.operating_company_id, parsed.data.limit, parsed.data.vendor_id);
      });
    },
  );

  // LEAD 443.112 #1 — the Owner's backfill of expense_load_links for load expenses written without one (the Creator's
  // pre-G13 direct writes). Link row only, never money; dry run unless asked; refusal audited.
  app.post("/api/v1/accounting/expenses/link-loads", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (req: FastifyRequest, reply: FastifyReply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const body = linkLoadsBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);
    const opco = query.data.operating_company_id;
    if (String(user.role ?? "") !== "Owner") {
      await withCompanyScope(user.uuid, opco, (client) =>
        refuseNonOwnerExpenseLoadLink(client, { userId: String(user.uuid), role: String(user.role ?? "") }, opco).catch((e) => {
          if (!(e instanceof ExpenseLoadLinkBackfillError)) throw e;
        })
      );
      return reply.code(403).send({ error: "owner_only", message: "Only the Owner can backfill expense load links." });
    }
    return withCompanyScope(user.uuid, opco, (client) =>
      linkExpensesToLoads(client, { operatingCompanyId: opco, actorUserId: String(user.uuid), actorRole: "Owner", dryRun: body.data.dry_run })
    );
  });

  app.get("/api/v1/expenses/next-number", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req: FastifyRequest, reply: FastifyReply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!accountingRoles(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });
    const parsed = companyQuerySchema.extend({ check: z.string().trim().max(40).optional() }).safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);
    const payload = await withCompanyScope(String(user.uuid), parsed.data.operating_company_id, async (client) => {
      if (!(await relationExists(client, "accounting.expenses"))) return null;
      if (!(await columnExists(client, "accounting", "expenses", "expense_number"))) return null;
      const base = await suggestFromLastSaved(
        client,
        {
          text: `
            SELECT expense_number AS last_number
              FROM accounting.expenses
             WHERE operating_company_id = $1::uuid
               AND COALESCE(expense_number, '') <> ''
             ORDER BY created_at DESC NULLS LAST
             LIMIT 1
          `,
          values: [parsed.data.operating_company_id],
        },
        () => nextExpenseDisplayId(client, parsed.data.operating_company_id)
      );
      if (!parsed.data.check) return base;
      const check = parseOperatorDocumentNumber(parsed.data.check);
      if (!check) return { ...base, taken: false };
      const taken = await client.query(
        `SELECT 1 FROM accounting.expenses WHERE operating_company_id = $1::uuid AND expense_number = $2 LIMIT 1`,
        [parsed.data.operating_company_id, check]
      );
      return { ...base, taken: Boolean(taken.rows[0]) };
    });
    if (!payload) return reply.code(501).send({ error: "accounting_expenses_schema_missing" });
    return payload;
  });

  // Law §9 reverse drill-through: expense detail (header + lines + vendor/JE/load/unit/GL ids).
  // Entity-scoped via withCompanyScope + explicit operating_company_id filter. SELECT only.
  app.get("/api/v1/expenses/:id", { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } }, async (req: FastifyRequest, reply: FastifyReply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!accountingRoles(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });

    const params = expenseIdParamSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const parsed = companyQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);
    const q = parsed.data;

    const result = await withCompanyScope(String(user.uuid), q.operating_company_id, async (client) => {
      if (!(await relationExists(client, "accounting.expenses"))) return { unavailable: true as const };

      const hasUnitId = await columnExists(client, "accounting", "expenses", "unit_id");
      const hasTrailerId = await columnExists(client, "accounting", "expenses", "trailer_id");
      const hasWorkOrderId = await columnExists(client, "accounting", "expenses", "linked_work_order_uuid");
      const hasPaymentAccount = await columnExists(client, "accounting", "expenses", "payment_account_uuid");
      const hasExpenseAccount = await columnExists(client, "accounting", "expense_lines", "expense_account_uuid");
      const hasAmountCents = await columnExists(client, "accounting", "expense_lines", "amount_cents");
      const hasItemId = await columnExists(client, "accounting", "expense_lines", "item_id");
      const hasOverrideReason = await columnExists(client, "accounting", "expense_lines", "item_account_override_reason");
      const hasQuantity = await columnExists(client, "accounting", "expense_lines", "quantity");
      const hasRateCents = await columnExists(client, "accounting", "expense_lines", "rate_cents");
      const hasUnitOfMeasure = await columnExists(client, "accounting", "expense_lines", "unit_of_measure");

      const headerRes = await client.query(
        `
          SELECT
            e.id::text                                   AS id,
            e.expense_number                             AS expense_number,
            e.vendor_document_number                     AS vendor_document_number,
            e.transaction_date                           AS transaction_date,
            e.total_amount_cents::text                   AS total_amount_cents,
            e.status                                     AS status,
            e.posting_status                             AS posting_status,
            e.posting_hold_reason                        AS posting_hold_reason,
            e.memo                                       AS memo,
            e.merchant_address                           AS merchant_address,
            e.source_settlement_ref                      AS source_settlement_ref,
            -- VIS-01: the DETAIL payload never exposed voided_at/void_reason at all (list-page callers
            -- can infer void from status='void' alone, but the detail page needs the date + reason for
            -- the top-of-page VoidedBanner -- same fields invoices.routes.ts already returns).
            e.voided_at::text                            AS voided_at,
            e.void_reason                                AS void_reason,
            e.voided_by_user_id::text                    AS voided_by_user_id,
            e.load_id::text                              AS load_id,
            e.vendor_uuid::text                          AS vendor_uuid,
            e.driver_uuid::text                          AS driver_uuid,
            e.journal_entry_id::text                     AS journal_entry_id,
            e.reversed_by_je_id::text                    AS reversed_by_je_id,
            e.posted_at::text                            AS posted_at,
            e.created_at::text                           AS created_at,
            ${hasPaymentAccount ? "e.payment_account_uuid::text" : "NULL::text"} AS payment_account_uuid,
            ${hasUnitId ? "e.unit_id::text" : "NULL::text"} AS unit_id,
            ${hasTrailerId ? "e.trailer_id::text" : "NULL::text"} AS trailer_id,
            ${hasWorkOrderId ? "e.linked_work_order_uuid::text" : "NULL::text"} AS linked_work_order_uuid,
            -- ACCT-EXPENSES-VENDOR-DEACTIVATED-TOMBSTONE: mdata.vendors' RLS policy hard-excludes any
        -- row with deactivated_at IS NOT NULL for a non-bypass reader, so a plain join silently
        -- returns NULL for vendor_name even when e.vendor_uuid is a perfectly valid FK — the vendor
        -- just went inactive since. Same class already fixed for invoices/ap-aging/parts-inventory
        -- (mdata.resolve_vendor_label_same_company, migration 202612780000) — this surface was the
        -- swept gap (confirmed absent from verify-deactivated-counterparty-resolver-coverage.mjs's
        -- own coverage list).
        COALESCE(v.vendor_name, mdata.resolve_vendor_label_same_company(e.vendor_uuid, e.operating_company_id)) AS vendor_name,
            dr.first_name                                AS driver_first_name,
            dr.last_name                                 AS driver_last_name,
            l.load_number                                AS load_number,
            ${hasUnitId ? "u.unit_number" : "NULL::text"}  AS unit_display_id,
            ${hasTrailerId ? "tr.equipment_number" : "NULL::text"} AS trailer_display_id,
            ${hasWorkOrderId ? "wo.display_id" : "NULL::text"} AS work_order_display_id,
            pay_acct.account_number                      AS payment_account_number,
            pay_acct.account_name                        AS payment_account_name,
            ${EXPENSE_MATCHED_BANK_TRANSACTION_ID_SQL}   AS matched_bank_transaction_id,
            je.entry_date                                  AS journal_entry_date,
            je.memo                                        AS journal_entry_memo,
            -- ACCT-F5072: matched bank date/description are the EntityLink human labels (never UUID chrome).
            bt.transaction_date                            AS matched_bank_transaction_date,
            bt.description                                 AS matched_bank_transaction_description,
            bt.amount_cents::text                          AS matched_bank_transaction_amount_cents,
            -- Linkage law §8 back-link: a fuel expense document drills to the purchase it was made from,
            -- and says so when that purchase has since been voided (FUEL-SOURCE-VOIDED-UNDER-LIVE-EXPENSE).
            e.source_fuel_transaction_id::text             AS source_fuel_transaction_id,
            (SELECT ft.voided_at::text FROM fuel.fuel_transactions ft
              WHERE ft.id = e.source_fuel_transaction_id AND ft.operating_company_id = e.operating_company_id) AS source_fuel_voided_at
          FROM accounting.expenses e
          LEFT JOIN mdata.vendors v ON v.id = e.vendor_uuid AND v.operating_company_id = e.operating_company_id
          LEFT JOIN mdata.drivers dr ON dr.id = e.driver_uuid AND dr.operating_company_id = e.operating_company_id
          LEFT JOIN mdata.loads l ON l.id = e.load_id AND l.operating_company_id = e.operating_company_id
          LEFT JOIN accounting.journal_entries je ON je.id = e.journal_entry_id AND je.operating_company_id = e.operating_company_id
          LEFT JOIN banking.bank_transactions bt ON bt.matched_expense_id = e.id AND bt.operating_company_id = e.operating_company_id
          ${hasUnitId ? "LEFT JOIN mdata.units u ON u.id = e.unit_id AND COALESCE(u.currently_leased_to_company_id, u.owner_company_id) = e.operating_company_id" : ""}
          ${hasTrailerId ? "LEFT JOIN mdata.equipment tr ON tr.id = e.trailer_id AND COALESCE(tr.currently_leased_to_company_id, tr.owner_company_id) = e.operating_company_id" : ""}
          ${hasWorkOrderId ? "LEFT JOIN maintenance.work_orders wo ON wo.id = e.linked_work_order_uuid AND wo.operating_company_id = e.operating_company_id" : ""}
          ${hasPaymentAccount ? "LEFT JOIN catalogs.accounts pay_acct ON pay_acct.id = e.payment_account_uuid AND pay_acct.operating_company_id = e.operating_company_id" : "LEFT JOIN catalogs.accounts pay_acct ON false"}
          WHERE e.id = $1::uuid
            AND e.operating_company_id = $2::uuid
          LIMIT 1
        `,
        [params.data.id, q.operating_company_id]
      );
      const expense = headerRes.rows[0] as Record<string, unknown> | undefined;
      if (!expense) return { notFound: true as const };

      const linesRes = await client.query(
        `
          SELECT
            el.id::text                                  AS id,
            el.line_sequence                             AS line_sequence,
            ${hasAmountCents ? "el.amount_cents::text" : "NULL::text"} AS amount_cents,
            el.description                               AS description,
            ${hasItemId ? "el.item_id::text" : "NULL::text"} AS item_id,
            ${hasQuantity ? "el.quantity::text" : "NULL::text"} AS quantity,
            ${hasRateCents ? "el.rate_cents::text" : "NULL::text"} AS rate_cents,
            ${hasUnitOfMeasure ? "el.unit_of_measure" : "NULL::text"} AS unit_of_measure,
            ${hasItemId ? "item.item_name" : "NULL::text"} AS item_name,
            -- 443.67 G3 — why this line's account differs from its item's default (null when it does not).
            ${hasOverrideReason ? "el.item_account_override_reason" : "NULL::text"} AS item_account_override_reason,
            ${hasExpenseAccount ? "el.expense_account_uuid::text" : "NULL::text"} AS expense_account_uuid,
            acct.account_number                          AS expense_account_number,
            acct.account_name                            AS expense_account_name
          FROM accounting.expense_lines el
          ${hasItemId ? "LEFT JOIN catalogs.items item ON item.id = el.item_id" : ""}
          ${hasExpenseAccount
            ? "LEFT JOIN catalogs.accounts acct ON acct.id = el.expense_account_uuid AND acct.operating_company_id = $2::uuid"
            : "LEFT JOIN catalogs.accounts acct ON acct.operating_company_id = $2::uuid AND false"}
          WHERE el.expense_id = $1::uuid
          ORDER BY el.line_sequence ASC
        `,
        [params.data.id, q.operating_company_id]
      );

      return { expense, lines: linesRes.rows };
    });

    if ("unavailable" in result) return reply.code(404).send({ error: "expenses_unavailable" });
    if ("notFound" in result) return reply.code(404).send({ error: "expense_not_found" });
    return reply.code(200).send(result);
  });

  // Pre-existing gap surfaced by verify-new-auth-routes-rate-limited when this file changed: the
  // expense CREATE route authorized but carried no rateLimit (CodeQL js/missing-rate-limiting), while
  // its sibling GET/PATCH routes here already do. Matched to the mutating-route budget used at :334.

  app.post("/api/v1/expenses", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req: FastifyRequest, reply: FastifyReply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!accountingRoles(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });

    const parsed = createExpenseBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);
    const body = parsed.data;

    // Driverless general expense (e.g. "Record expense") guardrails: a categorized cash-out must carry
    // BOTH a GL category and the cash/bank account it was paid from — no uncategorized cash-out, no
    // orphan payable. Driver-centric callers (driver_id present) keep the existing optional behavior.
    if (!body.driver_id) {
      if (!body.category_qbo_id && !body.category_account_id) {
        return reply.code(400).send({ error: "category_required_for_driverless_expense" });
      }
      if (!body.payment_account_uuid) return reply.code(400).send({ error: "payment_account_required_for_driverless_expense" });
    }

    try {
      const payload = await withCompanyScope(user.uuid, body.operating_company_id, (client) =>
        createExpenseInClientTx(client, body, user.uuid));

      if ("unavailable" in payload) return reply.code(501).send({ error: "accounting_expenses_schema_missing" });
      if ("itemNotInCompany" in payload) return reply.code(400).send({ error: "item_not_in_company", detail: "The item is not one of this company's items." });
      // GO-19-1b G1 — "an expense with no truck cannot be costed." unit_id must be supplied directly
      // or derivable from load_id's mdata.loads.assigned_unit_id; neither resolving is a hard reject,
      // never a silent NULL write.
      if ("unitIdRequired" in payload)
        return reply.code(400).send({
          error: "unit_id_required",
          detail:
            "An expense with no truck cannot be costed. Provide unit_id directly, or a load_id whose load already carries an assigned unit.",
        });
      // LEAD 443.128 B — the expense's unit / driver / trailer must be its load's; a different one is refused by name.
      if ("loadAttributionMismatch" in payload) {
        const m = payload as unknown as ExpenseLoadMismatch;
        return reply.code(400).send({
          error: EXPENSE_LOAD_MISMATCH_ERROR[m.mismatch],
          detail: `The expense names a load whose ${m.mismatch} is ${m.load ?? "not set"}, not the ${m.mismatch} supplied (${m.supplied}). An expense on a load carries that load's unit, driver and trailer.`,
          supplied: m.supplied,
          load_value: m.load,
        });
      }
      // GO-19-1b G2 — an expense may not carry a load_id whose load has a DIFFERENT unit_id.
      if ("unitLoadMismatch" in payload)
        return reply.code(400).send({
          error: "unit_load_mismatch",
          detail: "The supplied unit_id does not match the load's own assigned unit.",
          unit_id: (payload as { unitId?: string }).unitId ?? null,
          load_unit_id: (payload as { loadUnitId?: string }).loadUnitId ?? null,
        });
      if ("fixedCostCannotCarryLoadId" in payload)
        return reply.code(400).send({
          error: "fixed_cost_cannot_carry_load_id",
          detail:
            "This is a fixed period cost on the unit (insurance/plates/note), not a trip cost. Remove the load_id -- forcing a period cost onto a load makes trip margin meaningless.",
          category_code: (payload as { code?: string }).code ?? null,
        });
      if ("categoryUnbridged" in payload)
        return reply.code(409).send({
          error: "category_not_in_ledger_chart",
          detail: "The selected QBO expense category is not yet bridged into this entity's chart of accounts. Sync/complete the CoA migration for this account before recording the expense.",
        });
      if ("categoryNotInEntityCatalog" in payload)
        return reply.code(409).send({
          error: "expense_category_not_in_entity_catalog",
          detail: "The selected expense category does not belong to this operating company, or is inactive. Pick a category from this entity's Expense Categories list.",
        });
      if ("vendorNotInCompany" in payload)
        return reply.code(400).send({ error: "expense_vendor_not_in_company" });
      if ("loadNotInCompany" in payload)
        return reply.code(400).send({ error: "expense_load_not_in_company" });
      if ("duplicateSubmission" in payload)
        return reply.code(409).send({
          error: "duplicate_expense_submission",
          detail:
            "An expense with this exact memo was already recorded for this company in the last 2 minutes. If this is intentional, vary the memo text.",
          existing_expense_id: (payload as { existingExpenseId?: string }).existingExpenseId ?? null,
        });
      if ("duplicateVendorDocumentNumber" in payload)
        return reply.code(409).send({
          error: "duplicate_vendor_document_number",
          vendor_document_number: (payload as { vendorDocumentNumber?: string }).vendorDocumentNumber ?? null,
          existing_id: (payload as { existingExpenseId?: string }).existingExpenseId ?? null,
        });
      // ACCOUNTING-SPINE-EVENT-FIRE-AND-FORGET-SILENT-DROP: expense.created now emits inside the
      // creation transaction above — awaited, never diverges from the row.

      // (P-NOW) GL POSTING — a categorized cash-out (category account + payment account) posts a balanced
      // JE through the EXISTING engine: DR the resolved category account, CR the payment account. Still
      // gated by EXPENSE_GL_POSTING_ENABLED (owner flag) — when OFF this is a no-op and the expense stays
      // unposted (identical to every other expense today), so flipping the flag is the single activation
      // switch. A posting failure is non-fatal: the expense exists and can be posted later via /:id/post.
      const created = payload as { expense_id?: string; category_account_id?: string | null; has_payment_account?: boolean; posted_journal_entry_id?: string | null };
      const expenseId = created.expense_id ?? "";
      let posting_status: "posted" | "unposted" = created.posted_journal_entry_id ? "posted" : "unposted";
      let journal_entry_id: string | null = created.posted_journal_entry_id ?? null;
      let posting_hold_reason: string | null = null;
      if (expenseId && !journal_entry_id && created.category_account_id && created.has_payment_account) {
        // ACC-50 REMOVED (claude/00-SEAT-CONTRACT.md §3 corollary, owner ruling 2026-09-29): "an
        // expense on an open load posts on its transaction date. No guard may block a post because
        // a tour is open. Cost attribution to a load is a reporting join, never a posting delay."
        // Posting now depends only on the flag; whether the load's tour is open/closed is no longer
        // consulted here at all.
        const flagOn = await withCompanyScope(user.uuid, body.operating_company_id, (client) =>
          isEnabled(client, EXPENSE_GL_POSTING_FLAG_KEY, { operating_company_id: body.operating_company_id, user_uuid: String(user.uuid) })
        );
        if (flagOn) {
          try {
            const posting = await postSourceTransaction(
              { operating_company_id: body.operating_company_id, source_transaction_type: "expense", source_transaction_id: expenseId },
              { userId: String(user.uuid) }
            );
            journal_entry_id = posting.journal_entry_id;
            await withCompanyScope(user.uuid, body.operating_company_id, async (client) => {
              await client.query(
                // ROOT CAUSE FIX (Lead finding, 2026-09-26): this UPDATE flipped posting_status to
                // 'posted' but never touched the SEPARATE `status` column (draft/posted/void) --
                // leaving a genuinely GL-posted expense's own header reading status='draft' forever
                // (15 live USMCA rows found this way, no code path ever advances it). A document
                // whose GL just posted IS posted; status must move in lockstep with posting_status
                // here, not stay behind for some later, nonexistent step.
                `UPDATE accounting.expenses
                    SET status='posted', posting_status='posted', posted_at=now(), journal_entry_id=$2::uuid, updated_at=now()
                  WHERE id=$1::uuid AND operating_company_id=$3::uuid`,
                [expenseId, journal_entry_id, body.operating_company_id]
              );
              await appendCrudAudit(client, user.uuid, "expense.posted", { expense_id: expenseId, journal_entry_id, source: "record_expense_create" }, "info");
            });
            posting_status = "posted";
          } catch (err) {
            if (!(err instanceof PostingEngineError)) throw err;
            // leave unposted — surfaced via posting_status; expense remains valid + re-postable.
          }
        }
      }

      // FEED GATE (owner law 2026-10-01): record the expense's linkage evidence now (vendor, paid-from, category line,
      // posted JE, load/unit/driver/class) and hand it back so the creator / batch grid shows the red rows per row.
      let feed_gate: { intake_id: string; status: string; checks_failed: number; checks_total: number } | null = null;
      if (expenseId) {
        try {
          const run = await openAndRunIntake(String(user.uuid), body.operating_company_id, "expense", expenseId);
          feed_gate = { intake_id: run.intake.id, status: run.intake.status, checks_failed: run.intake.checks_failed, checks_total: run.intake.checks_total };
        } catch (err) {
          await withCompanyScope(user.uuid, body.operating_company_id, (client) =>
            appendCrudAudit(client, user.uuid, "expense.feed_gate_run_failed", { expense_id: expenseId, message: err instanceof Error ? err.message : String(err) }, "warning", "ACCT-F9602")
          );
        }
      }
      return reply.code(201).send({ ...payload, posting_status, journal_entry_id, posting_hold_reason, feed_gate });
    } catch (error) {
      if (error instanceof ExpensePostRefused) return reply.code(409).send({ error: "expense_post_refused_gl_post_failed", code: error.code, message: error.detail });
      const code = (error as { code?: string }).code;
      if (code === "23503") return reply.code(400).send({ error: "invalid_foreign_key" });
      if (code === "23505") return reply.code(409).send({ error: "expense_conflict" });
      throw error;
    }
  });

  app.post("/api/v1/expenses/:expenseId/reattribute", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req: FastifyRequest, reply: FastifyReply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!accountingRoles(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });

    const params = z.object({ expenseId: z.string().uuid() }).safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);

    const parsed = reattributeBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);
    const body = parsed.data;

    try {
      const payload = await withCompanyScope(user.uuid, body.operating_company_id, async (client) => {
        if (!(await relationExists(client, "accounting.expenses"))) {
          return { unavailable: true as const };
        }

        const linkRes = await client.query(
          `
            SELECT id, expense_number
            FROM expense_attribution.expense_load_links
            WHERE expense_source = 'accounting'
              AND expense_id = $1
              AND operating_company_id = $2::uuid
            LIMIT 1
          `,
          [params.data.expenseId, body.operating_company_id]
        );

        const existingLink = (linkRes.rows[0] as { id: string; expense_number: string | null } | undefined) ?? null;
        const priorNumber = existingLink?.expense_number ?? null;

        const numbered = await generateExpenseNumber(client, body.new_load_id, body.operating_company_id);

        if (existingLink?.id) {
          await client.query(
            `
              UPDATE expense_attribution.expense_load_links
              SET load_id = $2,
                  load_number = $3,
                  expense_seq = $4,
                  expense_number = $5,
                  attribution_method = 'manual_override',
                  attribution_confidence = 'high',
                  attribution_reason = $6,
                  attributed_at = now(),
                  attributed_by_user_id = $7,
                  overridden_from_expense_number = COALESCE(overridden_from_expense_number, $8)
              WHERE id = $1
            `,
            [
              existingLink.id,
              body.new_load_id,
              numbered.loadNumber,
              numbered.seq,
              numbered.number,
              body.reason,
              user.uuid,
              priorNumber,
            ]
          );
        } else {
          await insertExpenseLoadLink(client, {
            operatingCompanyId: body.operating_company_id,
            expenseId: params.data.expenseId,
            loadId: body.new_load_id,
            loadNumber: numbered.loadNumber,
            seq: numbered.seq,
            expenseNumber: numbered.number,
            method: "manual_override",
            confidence: "high",
            reason: body.reason,
            userId: user.uuid,
            overriddenFromExpenseNumber: priorNumber,
          });
        }

        if (await columnExists(client, "accounting", "expenses", "expense_number")) {
          await client.query(`UPDATE accounting.expenses SET expense_number = $2 WHERE id = $1`, [
            params.data.expenseId,
            numbered.number,
          ]);
        }
        if (await columnExists(client, "accounting", "expenses", "load_id")) {
          // RULING 443.86 #3 (S4-feed): the importer's load stamp IS the recommendation; changing it here moves the COST to the
          // new load — the header, every line, the fuel transaction it came from (and its Relay siblings on the same document)
          // and the live GL postings of its journal entry — in this one transaction (posting load_id is a dimension, not a fact:
          // refuse_posting_fact_update leaves it writable; amounts and accounts never move).
          const prior = (await client.query(
            `SELECT load_id::text, journal_entry_id::text, source_fuel_transaction_id::text FROM accounting.expenses WHERE id = $1 FOR UPDATE`,
            [params.data.expenseId]
          )).rows[0] as { load_id: string | null; journal_entry_id: string | null; source_fuel_transaction_id: string | null } | undefined;
          await client.query(`UPDATE accounting.expenses SET load_id = $2 WHERE id = $1`, [params.data.expenseId, body.new_load_id]);
          await client.query(`UPDATE accounting.expense_lines SET load_id = $2 WHERE expense_id = $1 AND load_id IS DISTINCT FROM $2`, [params.data.expenseId, body.new_load_id]);
          if (prior?.source_fuel_transaction_id) {
            await client.query(
              `UPDATE fuel.fuel_transactions SET load_id = $2, updated_at = now()
                WHERE operating_company_id = $3::uuid AND (id = $1::uuid OR id IN (
                  SELECT sib.id FROM fuel.fuel_transactions sib JOIN fuel.fuel_transactions me ON me.id = $1::uuid
                   WHERE me.relay_fuel_transaction_id IS NOT NULL AND sib.relay_fuel_transaction_id = me.relay_fuel_transaction_id))`,
              [prior.source_fuel_transaction_id, body.new_load_id, body.operating_company_id]
            );
          }
          if (prior?.journal_entry_id && prior.load_id && prior.load_id !== body.new_load_id) {
            // A posting's load is a fact (refuse_posting_fact_update) and the ledger is WORM, so the cost moves the way the
            // Reclassify engine moves an account: ONE reattribution entry for the document, each live line of its entry that
            // sits on the old load posted back (opposite side, old load) and again on the new load (same side) — same account,
            // amount, source and party. Net: the cost leaves the old load and lands on the new one; TB and every account balance
            // unchanged. Works for every poster of the document (expense, fuel_event, ...).
            const legs = (await client.query(
              `SELECT p.account_id::text, p.debit_or_credit, p.amount_cents::bigint AS amount_cents, p.source_transaction_type,
                      p.source_transaction_id::text, p.source_transaction_line_id::text, p.entity_uuid::text, p.entity_type,
                      p.class_id::text, p.location_id::text, je.entry_date::text
                 FROM accounting.journal_entry_postings p JOIN accounting.journal_entries je ON je.id = p.journal_entry_uuid AND je.operating_company_id = p.operating_company_id
                WHERE p.journal_entry_uuid = $1::uuid AND p.operating_company_id = $2::uuid AND p.load_id = $3::uuid
                  AND p.reversed_by_line_id IS NULL AND je.voided_at IS NULL AND je.reversed_by_je_id IS NULL
                ORDER BY p.line_sequence`,
              [prior.journal_entry_id, body.operating_company_id, prior.load_id]
            )).rows as Array<{ account_id: string; debit_or_credit: "debit" | "credit"; amount_cents: string; source_transaction_type: string;
              source_transaction_id: string; source_transaction_line_id: string | null; entity_uuid: string | null; entity_type: string | null;
              class_id: string | null; location_id: string | null; entry_date: string }>;
            if (legs.length) {
              const memo = `Expense ${numbered.number} moved to load ${numbered.loadNumber}: ${body.reason}`.slice(0, 500);
              const leg = (l: (typeof legs)[number], dc: "debit" | "credit", loadId: string) => ({
                account_id: l.account_id, debit_or_credit: dc, amount_cents: Number(l.amount_cents), description: memo,
                source_transaction_type: l.source_transaction_type, source_transaction_id: l.source_transaction_id,
                ...(l.source_transaction_line_id ? { source_transaction_line_id: l.source_transaction_line_id } : {}),
                entity_uuid: l.entity_uuid, entity_type: l.entity_type, class_id: l.class_id, location_id: l.location_id, load_id: loadId,
              });
              const today = todayIso();
              const je = await createJournalEntryOnClient(
                client as never,
                {
                  operating_company_id: body.operating_company_id,
                  entry_date: legs[0]!.entry_date > today ? legs[0]!.entry_date : today,
                  memo,
                  source: "auto",
                  postings: legs.flatMap((l) => [
                    leg(l, l.debit_or_credit === "debit" ? "credit" : "debit", prior.load_id!),
                    leg(l, l.debit_or_credit, body.new_load_id),
                  ]) as never,
                },
                { userId: String(user.uuid), role: String(user.role ?? "") }
              );
              await appendCrudAudit(client, user.uuid, "expense.reattribution_posted",
                { expense_id: params.data.expenseId, journal_entry_id: je.id, from_load_id: prior.load_id, to_load_id: body.new_load_id, lines: legs.length }, "info", "443.86");
            }
          }
        }

        await emitOutbox(client, "expense.reattributed", {
          expense_id: params.data.expenseId,
          operating_company_id: body.operating_company_id,
          new_load_id: body.new_load_id,
          expense_number: numbered.number,
          prior_expense_number: priorNumber,
        });

        await appendCrudAudit(
          client,
          user.uuid,
          "expense.reattributed",
          {
            expense_id: params.data.expenseId,
            new_load_id: body.new_load_id,
            expense_number: numbered.number,
            prior_expense_number: priorNumber,
          },
          "info",
          "P6-T11176"
        );

        // ACCOUNTING-SPINE-EVENT-FIRE-AND-FORGET-SILENT-DROP: this used to fire in a SEPARATE
        // withCompanyScope transaction opened AFTER this one had already committed, with a bare
        // .catch(warn) — a real emit failure was silently swallowed (the reattribution happened, the
        // audit trail doesn't). Moved into the reattribution's own transaction, awaited, so the write
        // and its spine event can never diverge.
        await emitAccountingSpineEvent(client, {
          operating_company_id: body.operating_company_id,
          actor_user_id: String(user.uuid),
          event_type: "expense.reattributed",
          entity_id: params.data.expenseId,
          entity_type: "expense",
          source_table: "accounting.expenses",
          payload: { new_load_id: body.new_load_id },
        });

        return { expense_number: numbered.number };
      });

      if ("unavailable" in payload) return reply.code(501).send({ error: "accounting_expenses_schema_missing" });
      return reply.code(200).send(payload);
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === "23503") return reply.code(400).send({ error: "invalid_foreign_key" });
      throw error;
    }
  });

  // GAP-EXPENSES Phase 2 Step 3 — explicit "Post to GL" (gated EXPENSE_GL_POSTING_ENABLED, default OFF).
  app.post("/api/v1/expenses/:expenseId/post", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req: FastifyRequest, reply: FastifyReply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const params = z.object({ expenseId: z.string().uuid() }).safeParse(req.params ?? {});
    if (!params.success) return reply.code(400).send({ error: "validation_error" });
    const body = z.object({ operating_company_id: z.string().uuid() }).safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "validation_error", details: body.error.flatten() });
    const oci = body.data.operating_company_id;
    const expenseId = params.data.expenseId;

    // Step A (own tx): flag + role + eligibility; synthesize the uncategorized line for a direct
    // (line-less) expense so total_amount_cents = SUM(expense_lines.amount_cents) holds at the flip.
    const pre = await withCompanyScope(user.uuid, oci, async (client) => {
      if (!(await isEnabled(client, EXPENSE_GL_POSTING_FLAG_KEY, { operating_company_id: oci, user_uuid: String(user.uuid) }))) {
        return { kind: "disabled" as const };
      }
      if (!canVoid(String(user.role ?? ""))) return { kind: "forbidden" as const }; // post = Owner + Accountant (decision 4)
      const r = await client.query(
        `SELECT e.posting_status, e.status, e.total_amount_cents::text, e.payment_account_uuid::text, e.vendor_uuid::text,
                (SELECT count(*) FROM accounting.expense_lines l WHERE l.expense_id = e.id)::int AS line_count
         FROM accounting.expenses e WHERE e.id = $1::uuid AND e.operating_company_id = $2::uuid LIMIT 1`,
        [expenseId, oci]
      );
      const exp = r.rows[0] as
        | { posting_status: string; status: string; total_amount_cents: string; payment_account_uuid: string | null; vendor_uuid: string | null; line_count: number }
        | undefined;
      if (!exp) return { kind: "not_found" as const };
      if (exp.status === "void") return { kind: "not_eligible" as const };
      if (exp.posting_status !== "unposted") return { kind: "already_posted" as const };
      // ACC-50 REMOVED (claude/00-SEAT-CONTRACT.md §3 corollary, owner ruling 2026-09-29) — a manual
      // "Post to GL" click no longer checks the load's tour status at all.
      // orphan guard (decision 3): no payment account AND no vendor → reject (no orphan payable). Clean 409 here;
      // buildExpenseLines keeps the same guard as the engine-level backstop.
      if (!exp.payment_account_uuid && !exp.vendor_uuid) return { kind: "orphan" as const };
      if (exp.line_count === 0) {
        const cents = Number(exp.total_amount_cents);
        await client.query(
          `INSERT INTO accounting.expense_lines (expense_id, line_sequence, amount_cents, amount, description)
           VALUES ($1::uuid, 1, $2, $3, 'Uncategorized')`,
          [expenseId, cents, cents / 100]
        );
      }
      return { kind: "ok" as const };
    });
    if (pre.kind === "disabled") return reply.code(409).send({ error: "expense_posting_not_enabled" });
    if (pre.kind === "forbidden") return reply.code(403).send({ error: "forbidden_owner_or_accountant_only" });
    if (pre.kind === "not_found") return reply.code(404).send({ error: "expense_not_found" });
    if (pre.kind === "not_eligible") return reply.code(409).send({ error: "expense_not_posting_eligible" });
    if (pre.kind === "already_posted") return reply.code(409).send({ error: "expense_already_posted" });
    if (pre.kind === "orphan") return reply.code(409).send({ error: "expense_orphan_no_payment_account_or_vendor" });

    // Step B: post the balanced JE (own tx, idempotent — re-post returns the existing batch).
    let journalEntryId: string;
    try {
      const posting = await postSourceTransaction(
        { operating_company_id: oci, source_transaction_type: "expense", source_transaction_id: expenseId },
        { userId: String(user.uuid) }
      );
      journalEntryId = posting.journal_entry_id;
    } catch (err) {
      if (err instanceof PostingEngineError) {
        if (err.code === "ACCOUNT_MAPPING_MISSING") return reply.code(409).send({ error: "expense_account_mapping_missing", detail: err.message });
        if (err.code === "PERIOD_LOCKED") return reply.code(409).send({ error: "period_locked" });
        if (err.code === "EXPENSE_NOT_POSTING_ELIGIBLE") return reply.code(409).send({ error: "expense_not_posting_eligible" });
      }
      throw err;
    }

    // Step C: flip the header to posted — Phase-1.5 gate passes (total = sum after synthesis).
    // ROOT CAUSE FIX (Lead finding, 2026-09-26): status must move with posting_status here too --
    // see the sister UPDATE above (record_expense_create's inline auto-post) for the full note.
    await withCompanyScope(user.uuid, oci, async (client) => {
      await client.query(
        `UPDATE accounting.expenses
         SET status='posted', posting_status='posted', posted_at=now(), journal_entry_id=$2::uuid, updated_at=now()
         WHERE id=$1::uuid AND operating_company_id=$3::uuid`,
        [expenseId, journalEntryId, oci]
      );
      await appendCrudAudit(client, user.uuid, "expense.posted", { expense_id: expenseId, journal_entry_id: journalEntryId }, "info");
    });
    return reply.code(200).send({ expense_id: expenseId, posting_status: "posted", journal_entry_id: journalEntryId });
  });

  // VOID = reversing JE (posted) / status flip (unposted). Gated VOID_ENFORCEMENT_ENABLED, Owner+Accountant, reason required.
  app.post("/api/v1/expenses/:expenseId/void", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req: FastifyRequest, reply: FastifyReply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const params = z.object({ expenseId: z.string().uuid() }).safeParse(req.params ?? {});
    if (!params.success) return reply.code(400).send({ error: "validation_error" });
    const body = z.object({ operating_company_id: z.string().uuid(), reason: z.string().trim().min(1) }).safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "validation_error", details: body.error.flatten() });
    const oci = body.data.operating_company_id;
    const expenseId = params.data.expenseId;

    const pre = await withCompanyScope(user.uuid, oci, async (client) => {
      if (!(await isVoidEnforcementEnabled(client, oci, String(user.uuid)))) return { kind: "disabled" as const };
      // Void executors = Owner + Administrator + Accountant (Jorge-aligned 2026-06-29; was Owner+Accountant).
      if (!canVoidCancel(String(user.role ?? ""))) return { kind: "forbidden" as const };
      const r = await client.query(
        `SELECT posting_status, status FROM accounting.expenses WHERE id=$1::uuid AND operating_company_id=$2::uuid LIMIT 1`,
        [expenseId, oci]
      );
      const exp = r.rows[0] as { posting_status: string; status: string } | undefined;
      if (!exp) return { kind: "not_found" as const };
      if (exp.status === "void" || exp.posting_status === "reversed") return { kind: "already_void" as const };
      return { kind: "ok" as const, posting_status: exp.posting_status };
    });
    if (pre.kind === "disabled") return reply.code(409).send({ error: "void_not_enabled" });
    if (pre.kind === "forbidden") return reply.code(403).send({ error: "forbidden_owner_or_accountant_only" });
    if (pre.kind === "not_found") return reply.code(404).send({ error: "expense_not_found" });
    if (pre.kind === "already_void") return reply.code(409).send({ error: "expense_already_void" });

    // ACCT-F5635 — the reversal and the header status-flip used to run as TWO independent
    // transactions (reversePostedSourceTransaction opens+commits its own connection internally, then
    // a SEPARATE withCompanyScope call did the UPDATE). If the process/connection died between the
    // two, the result was a fully-reversed GL entry (money net to zero, already durable) attached to
    // an expense header still reporting status='posted' -- a subledger-vs-GL divergence that would
    // keep showing as an active, uncorrected posted cost in every expense list/report even though the
    // GL had already zeroed it out. governance/void-cancel-executors.ts's executeExpense and
    // work-orders.routes.ts's WO-void cascade both already do the reversal + flip atomically on one
    // client; this route is the third writer and the only one that didn't. Fixed by using
    // reversePostedSourceTransactionInClientTx (the client-taking variant posting-engine.service.ts
    // already exports for exactly this) inside the SAME withCompanyScope transaction as the UPDATE --
    // no new GL math, reuses the identical posting-engine reversal semantics this route already used.
    try {
      // 443.136 follow-up — the ONE in-transaction expense void (accounting/expense-void.service.ts): reversal of everything
      // live (ACCT-F4431310), bank-line release, header flip, cascade and audit, atomically on this client.
      const voided = await withCompanyScope(user.uuid, oci, async (client) =>
        voidExpenseDocumentInClientTx(client as never, { operatingCompanyId: oci, expenseId, actorUserId: String(user.uuid), reason: body.data.reason }));
      return reply.code(200).send({ expense_id: expenseId, status: "void", reversing_journal_entry_id: voided.reversingJeId });
    } catch (err) {
      if (err instanceof PostingEngineError && err.code === "PERIOD_LOCKED") return reply.code(409).send({ error: "period_locked" });
      throw err;
    }
  });

  // R-191 — universal unvoid counterpart to /void. Clears void stamps + reinstated_*; voids the
  // reversing JE via Option-1 so the original expense JE stands alone again.
  app.post("/api/v1/expenses/:expenseId/unvoid", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req: FastifyRequest, reply: FastifyReply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const params = z.object({ expenseId: z.string().uuid() }).safeParse(req.params ?? {});
    if (!params.success) return reply.code(400).send({ error: "validation_error" });
    const body = z.object({ operating_company_id: z.string().uuid(), reason: z.string().trim().min(1) }).safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "validation_error", details: body.error.flatten() });
    const oci = body.data.operating_company_id;
    if (!canVoidCancel(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden_owner_or_accountant_only" });

    try {
      const result = await reinstateDocumentThenVoidReversal(
        (fn) =>
          withCompanyScope(user.uuid, oci, async (client) => {
            await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [oci]);
            return fn(client as never);
          }),
        {
          operatingCompanyId: oci,
          type: "expense",
          id: params.data.expenseId,
          reason: body.data.reason,
          actor: { userId: String(user.uuid), role: String(user.role ?? "") },
        }
      );
      return reply.code(200).send({
        expense_id: params.data.expenseId,
        reinstated_at: result.reinstatedAt,
        reinstated_from_void_je_id: result.reinstatedFromVoidJeId,
        status: result.restoreStatus,
      });
    } catch (err) {
      if (err instanceof ReinstateDocumentError) {
        const code = err.code.includes("not_found") ? 404 : err.code.includes("not_void") ? 409 : 400;
        return reply.code(code).send({ error: err.code, message: err.message });
      }
      throw err;
    }
  });

  // WAVE-3-EDIT-01 (owner 2026-08-29) — the DRAFT/unposted branch of the posting-state x period-state
  // edit matrix: "Draft/unposted -> direct edit, version the row, audit event, no GL impact." Of the 8
  // named transaction types, expense is the ONLY one with a real, distinct draft status (`status`
  // CHECK IN 'draft','posted','void', separate from `posting_status` CHECK IN 'unposted','posted',
  // 'reversed') -- bill_payment/customer_payment always post immediately on create (no draft state
  // exists for them at all; per Wave-3's OWN rule, "Externally transmitted... never a silent edit;
  // void-and-reissue" is the correct, ALREADY-BUILT path for those two, not a new edit endpoint).
  // Scope: header-only fields on a still-draft (status='draft', posting_status='unposted', ZERO
  // expense_lines rows -- the /post route above only synthesizes a line at the POST moment, so a
  // draft's total_amount_cents editing here never touches expense_lines) expense. Reason required on
  // every posted-document edit per Wave-3's own rule; a still-draft edit is not yet a posted document,
  // but a reason is still captured for the field-level revision history audit.trail.
  // The POSTED-and-period-OPEN branch (reverse the original posting, repost the corrected one, both
  // retained) is a separate, larger follow-on, not built in this pass -- see the board finding filed
  // alongside this commit for the exact remaining scope.
  const patchExpenseDraftBodySchema = z.object({
    operating_company_id: z.string().uuid(),
    reason: z.string().trim().min(1),
    memo: z.string().trim().max(2000).optional(),
    transaction_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    amount_cents: z.coerce.number().int().positive().optional(),
    vendor_uuid: z.string().uuid().optional().nullable(),
  });
  app.patch("/api/v1/expenses/:expenseId", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req: FastifyRequest, reply: FastifyReply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const params = z.object({ expenseId: z.string().uuid() }).safeParse(req.params ?? {});
    if (!params.success) return reply.code(400).send({ error: "validation_error" });
    const body = patchExpenseDraftBodySchema.safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "validation_error", details: body.error.flatten() });
    if (
      body.data.memo === undefined &&
      body.data.transaction_date === undefined &&
      body.data.amount_cents === undefined &&
      body.data.vendor_uuid === undefined
    ) {
      return reply.code(400).send({ error: "validation_error", details: "at least one editable field is required" });
    }
    const oci = body.data.operating_company_id;
    const expenseId = params.data.expenseId;

    try {
      const result = await withCompanyScope(user.uuid, oci, async (client) => {
        // Owner + Accountant, same authorization tier as /post and /void — this is a posted-document-
        // grade edit control even though the row itself is still draft.
        if (!canVoid(String(user.role ?? ""))) return { kind: "forbidden" as const };
        const r = await client.query(
          `
            SELECT
              e.status,
              e.posting_status,
              e.memo,
              e.transaction_date::text AS transaction_date,
              e.total_amount_cents::text AS total_amount_cents,
              e.vendor_uuid::text AS vendor_uuid,
              (SELECT count(*) FROM accounting.expense_lines l WHERE l.expense_id = e.id)::int AS line_count
            FROM accounting.expenses e
            WHERE e.id = $1::uuid AND e.operating_company_id = $2::uuid
            LIMIT 1
            FOR UPDATE
          `,
          [expenseId, oci]
        );
        const exp = r.rows[0] as
          | {
              status: string;
              posting_status: string;
              memo: string | null;
              transaction_date: string;
              total_amount_cents: string;
              vendor_uuid: string | null;
              line_count: number;
            }
          | undefined;
        if (!exp) return { kind: "not_found" as const };
        // FAIL LOUD, never a silent no-op: a posted or void expense refuses this route entirely — the
        // posted-and-open-period reverse+repost branch is a distinct, not-yet-built endpoint, and a
        // void expense has no live document left to correct.
        if (exp.status === "posted" && exp.posting_status === "posted") {
          // LEAD 443.129 E — a POSTED expense is never edited in place: the one correction path reverses its entry,
          // re-posts the corrected one (same expense_number) and audits it. Only its correctable fields go through here.
          const moneyFields = (["transaction_date", "amount_cents", "vendor_uuid"] as const).filter((f) => body.data[f] !== undefined);
          if (moneyFields.length) return { kind: "posted_field_not_correctable" as const, fields: moneyFields };
          const corrected = await correctPostedExpense(client, {
            operatingCompanyId: oci,
            expenseId,
            changes: { memo: body.data.memo },
            actorUserId: String(user.uuid),
            reason: body.data.reason,
          });
          return { kind: "posted_correction" as const, corrected };
        }
        if (exp.status !== "draft" || exp.posting_status !== "unposted") {
          return { kind: "not_draft" as const, status: exp.status, posting_status: exp.posting_status };
        }
        if (exp.line_count > 0) {
          // A draft should never carry lines yet (only /post synthesizes one) — if it somehow does,
          // amount_cents here would silently desync from SUM(expense_lines.amount_cents). Refuse
          // rather than guess which side is authoritative.
          return { kind: "has_lines" as const };
        }

        const before = {
          memo: exp.memo,
          transaction_date: exp.transaction_date,
          total_amount_cents: exp.total_amount_cents,
          vendor_uuid: exp.vendor_uuid,
        };

        const sets: string[] = [];
        const values: unknown[] = [];
        if (body.data.memo !== undefined) {
          values.push(body.data.memo);
          sets.push(`memo = $${values.length}`);
        }
        if (body.data.transaction_date !== undefined) {
          values.push(body.data.transaction_date);
          sets.push(`transaction_date = $${values.length}::date`);
        }
        if (body.data.amount_cents !== undefined) {
          values.push(body.data.amount_cents);
          sets.push(`total_amount_cents = $${values.length}`);
        }
        if (body.data.vendor_uuid !== undefined) {
          values.push(body.data.vendor_uuid);
          sets.push(`vendor_uuid = $${values.length}::uuid`);
        }
        sets.push(`updated_at = now()`);
        values.push(expenseId, oci);

        await client.query(
          `UPDATE accounting.expenses SET ${sets.join(", ")} WHERE id = $${values.length - 1}::uuid AND operating_company_id = $${values.length}::uuid`,
          values
        );

        const after = {
          memo: body.data.memo !== undefined ? body.data.memo : before.memo,
          transaction_date: body.data.transaction_date !== undefined ? body.data.transaction_date : before.transaction_date,
          total_amount_cents: body.data.amount_cents !== undefined ? String(body.data.amount_cents) : before.total_amount_cents,
          vendor_uuid: body.data.vendor_uuid !== undefined ? body.data.vendor_uuid : before.vendor_uuid,
        };
        await appendCrudAudit(
          client,
          user.uuid,
          "expense.draft_edited",
          { expense_id: expenseId, operating_company_id: oci, reason: body.data.reason, before, after },
          "info"
        );

        return { kind: "ok" as const, after };
      });

      if (result.kind === "forbidden") return reply.code(403).send({ error: "forbidden_owner_or_accountant_only" });
      if (result.kind === "not_found") return reply.code(404).send({ error: "expense_not_found" });
      if (result.kind === "posted_field_not_correctable") {
        return reply.code(409).send({
          error: "posted_expense_field_not_correctable",
          fields: result.fields,
          detail: `correctable on a posted expense: ${CORRECTABLE_EXPENSE_FIELDS.join(", ")} (POST /api/v1/expenses/:id/correct); a money change is a void and a new document`,
        });
      }
      if (result.kind === "posted_correction") {
        const c = result.corrected;
        if (c.outcome === "refused") return reply.code(409).send({ error: "expense_correction_refused", reason: c.reason });
        return reply.code(200).send(c);
      }
      if (result.kind === "not_draft") {
        return reply.code(409).send({
          error: "expense_not_draft",
          detail: `status=${result.status} posting_status=${result.posting_status} — only a draft/unposted expense can be edited via this route`,
        });
      }
      if (result.kind === "has_lines") {
        return reply.code(409).send({ error: "expense_has_lines", detail: "expense already carries line items; not editable via this route" });
      }
      return reply.code(200).send({ expense_id: expenseId, status: "draft", ...result.after });
    } catch (err) {
      if (err instanceof PostingEngineError && err.code === "PERIOD_LOCKED") return reply.code(409).send({ error: "period_locked" });
      throw err;
    }
  });

  // LEAD 443.129 E — the ONE correction path for a POSTED expense: reverse the live entry, correct the document (same
  // expense_number), re-post, one audit row. dry_run (default true) plans without writing. Owner + Accountant (as /void).
  const correctBodySchema = z.object({
    operating_company_id: z.string().uuid(),
    reason: z.string().trim().min(3),
    dry_run: z.boolean().optional().default(true),
    changes: z
      .object({
        driver_id: z.string().uuid().nullable().optional(),
        trailer_id: z.string().uuid().nullable().optional(),
        memo: z.string().max(2000).nullable().optional(),
        driver_from_fill: z.boolean().optional(),
      })
      .passthrough(),
  });
  app.post("/api/v1/expenses/:expenseId/correct", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req: FastifyRequest, reply: FastifyReply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const params = z.object({ expenseId: z.string().uuid() }).safeParse(req.params ?? {});
    if (!params.success) return reply.code(400).send({ error: "validation_error" });
    const body = correctBodySchema.safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "validation_error", details: body.error.flatten() });
    const oci = body.data.operating_company_id;
    try {
      const result = await withCompanyScope(user.uuid, oci, async (client) => {
        if (!canVoid(String(user.role ?? ""))) {
          await appendCrudAudit(client, user.uuid, "expense.correction_refused_role",
            { expense_id: params.data.expenseId, operating_company_id: oci, role: String(user.role ?? "") }, "warning", "LEAD-443.129");
          return { kind: "forbidden" as const };
        }
        const corrected = await correctPostedExpense(client, {
          operatingCompanyId: oci,
          expenseId: params.data.expenseId,
          changes: body.data.changes,
          actorUserId: String(user.uuid),
          reason: body.data.reason,
          dryRun: body.data.dry_run,
        });
        return { kind: "ok" as const, corrected };
      });
      if (result.kind === "forbidden") return reply.code(403).send({ error: "forbidden_owner_or_accountant_only" });
      const c = result.corrected;
      if (c.outcome === "refused") return reply.code(c.reason === "expense_not_found" ? 404 : 409).send({ error: "expense_correction_refused", reason: c.reason });
      return reply.code(200).send({ dry_run: body.data.dry_run, ...c });
    } catch (err) {
      if (err instanceof ExpenseCorrectionRefused) return reply.code(409).send({ error: "expense_correction_refused", reason: err.reason });
      if (err instanceof PostingEngineError && err.code === "PERIOD_LOCKED") return reply.code(409).send({ error: "period_locked" });
      throw err;
    }
  });

  // 443.28 — QuickBooks-style payment-source reclassification for a POSTED expense.
  // Creates a 2-line JE (Dr old_payment_account / Cr new_payment_account) without voiding the document.
  // Refused when: bank-matched, period closed, or moving to Relay without a relay_txn_id.
  const changePaymentSourceBodySchema = z.object({
    operating_company_id: z.string().uuid(),
    new_payment_account_uuid: z.string().uuid(),
    relay_txn_id: z.string().trim().optional(),
    reason: z.string().trim().min(1),
  });
  app.post("/api/v1/expenses/:expenseId/change-payment-source", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req: FastifyRequest, reply: FastifyReply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!accountingRoles(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });
    const params = z.object({ expenseId: z.string().uuid() }).safeParse(req.params ?? {});
    if (!params.success) return reply.code(400).send({ error: "validation_error" });
    const body = changePaymentSourceBodySchema.safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "validation_error", details: body.error.flatten() });
    const oci = body.data.operating_company_id;
    const expenseId = params.data.expenseId;

    try {
      const result = await withCompanyScope(user.uuid, oci, async (client) => {
        const r = await client.query(
          `SELECT e.posting_status, e.status, e.payment_account_uuid::text,
                  e.total_amount_cents::text, e.transaction_date::text, e.is_sample_data,
                  ${EXPENSE_MATCHED_BANK_TRANSACTION_ID_SQL} AS matched_bank_txn_id
             FROM accounting.expenses e
            WHERE e.id = $1::uuid AND e.operating_company_id = $2::uuid LIMIT 1`,
          [expenseId, oci]
        );
        const exp = r.rows[0] as { posting_status: string; status: string; payment_account_uuid: string | null; total_amount_cents: string; transaction_date: string; is_sample_data: boolean; matched_bank_txn_id: string | null } | undefined;
        if (!exp) return { kind: "not_found" as const };
        if (exp.status === "void") return { kind: "is_void" as const };
        if (exp.posting_status !== "posted") return { kind: "not_posted" as const, posting_status: exp.posting_status };
        if (exp.matched_bank_txn_id) return { kind: "bank_matched" as const, bank_txn_id: exp.matched_bank_txn_id };
        const oldPaymentAccountUuid = exp.payment_account_uuid;
        if (!oldPaymentAccountUuid) return { kind: "no_payment_account" as const };
        if (oldPaymentAccountUuid === body.data.new_payment_account_uuid) return { kind: "same_account" as const };

        // period must be open — createJournalEntryOnClient also checks, but this surfaces the error early
        await ensureOpenPeriod(client, oci, exp.transaction_date);

        // Relay-wallet rule: if new account = fuel_wallet_relay role, relay_txn_id is required
        const relayRoleRow = await client.query(
          `SELECT account_id::text FROM accounting.chart_of_accounts_roles WHERE operating_company_id = $1::uuid AND role_name = 'fuel_wallet_relay' LIMIT 1`,
          [oci]
        );
        const relayAccountId = (relayRoleRow.rows[0] as { account_id: string } | undefined)?.account_id;
        if (relayAccountId && body.data.new_payment_account_uuid === relayAccountId && !body.data.relay_txn_id) {
          return { kind: "relay_txn_required" as const };
        }

        // Verify new account exists in this company's CoA
        const newAcctRow = await client.query(
          `SELECT id::text FROM catalogs.accounts WHERE id = $1::uuid AND operating_company_id = $2::uuid LIMIT 1`,
          [body.data.new_payment_account_uuid, oci]
        );
        if (!newAcctRow.rows[0]) return { kind: "account_not_found" as const };

        // Reclassification JE: Dr old_payment_account / Cr new_payment_account
        const totalCents = Math.round(Number(exp.total_amount_cents));
        const je = await createJournalEntryOnClient(
          client,
          {
            operating_company_id: oci,
            entry_date: exp.transaction_date,
            memo: `Payment source reclassification — ${body.data.reason}`,
            source: "auto",
            source_transaction_type: "expense",
            source_transaction_id: expenseId,
            is_sample_data: exp.is_sample_data ?? false,
            postings: [
              { account_id: oldPaymentAccountUuid, debit_or_credit: "debit", amount_cents: totalCents, source_transaction_type: "expense", source_transaction_id: expenseId },
              { account_id: body.data.new_payment_account_uuid, debit_or_credit: "credit", amount_cents: totalCents, source_transaction_type: "expense", source_transaction_id: expenseId },
            ],
          },
          { userId: String(user.uuid), role: String(user.role ?? "") }
        );

        await client.query(
          `UPDATE accounting.expenses SET payment_account_uuid = $1::uuid, updated_at = now() WHERE id = $2::uuid AND operating_company_id = $3::uuid`,
          [body.data.new_payment_account_uuid, expenseId, oci]
        );
        await appendCrudAudit(client, user.uuid, "expense.payment_source_changed", {
          expense_id: expenseId,
          old_payment_account_uuid: oldPaymentAccountUuid,
          new_payment_account_uuid: body.data.new_payment_account_uuid,
          reclassification_je_id: je.id,
          relay_txn_id: body.data.relay_txn_id ?? null,
          reason: body.data.reason,
        }, "info");

        return { kind: "ok" as const, reclassification_je_id: je.id, old_payment_account_uuid: oldPaymentAccountUuid, new_payment_account_uuid: body.data.new_payment_account_uuid };
      });

      if (result.kind === "not_found") return reply.code(404).send({ error: "expense_not_found" });
      if (result.kind === "is_void") return reply.code(409).send({ error: "expense_is_void" });
      if (result.kind === "not_posted") return reply.code(409).send({ error: "expense_not_posted", detail: `posting_status=${result.posting_status}` });
      if (result.kind === "bank_matched") return reply.code(409).send({ error: "expense_bank_matched", detail: `bank_transaction_id=${result.bank_txn_id} must be unmatched first` });
      if (result.kind === "no_payment_account") return reply.code(409).send({ error: "expense_no_payment_account" });
      if (result.kind === "same_account") return reply.code(409).send({ error: "same_payment_account" });
      if (result.kind === "relay_txn_required") return reply.code(422).send({ error: "relay_txn_id_required", detail: "moving to the Relay Fuel Wallet requires relay_txn_id" });
      if (result.kind === "account_not_found") return reply.code(404).send({ error: "payment_account_not_found" });
      return reply.code(200).send({
        expense_id: expenseId,
        reclassification_journal_entry_id: result.reclassification_je_id,
        old_payment_account_uuid: result.old_payment_account_uuid,
        new_payment_account_uuid: result.new_payment_account_uuid,
      });
    } catch (err) {
      if (err instanceof PostingEngineError && err.code === "PERIOD_LOCKED") return reply.code(409).send({ error: "period_locked" });
      throw err;
    }
  });

  // Reverse drill-through: list expenses attributed to a specific load. Read-only SELECT, company-scoped.
  // Powers the Load detail "Expenses" tab. Delegates to queryExpensesList with loadId from the path param.
  const loadIdParamSchema = z.object({ id: z.string().uuid() });
  const loadExpensesQuerySchema = companyQuerySchema.extend({
    status: z.enum(["draft", "posted", "void"]).optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
    offset: z.coerce.number().int().min(0).default(0),
  });
  app.get("/api/v1/loads/:id/expenses", { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } }, async (req: FastifyRequest, reply: FastifyReply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!accountingRoles(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });
    const params = loadIdParamSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const parsed = loadExpensesQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);
    const q = parsed.data;

    const result = await withCompanyScope(String(user.uuid), q.operating_company_id, async (client) => {
      if (!(await relationExists(client, "accounting.expenses"))) return { unavailable: true as const };
      const countValues: unknown[] = [q.operating_company_id, params.data.id];
      let statusClause = "";
      if (q.status) {
        countValues.push(q.status);
        statusClause = `AND e.status = $${countValues.length}`;
      }
      const countResult = await client.query(
        `SELECT COUNT(*)::int AS total
         FROM accounting.expenses e
         WHERE e.operating_company_id = $1::uuid
           AND e.load_id = $2::uuid
           ${statusClause}`,
        countValues
      );
      const rows = await queryExpensesList(client, q.operating_company_id, {
        loadId: params.data.id,
        status: q.status,
        limit: q.limit,
        offset: q.offset,
      });
      return { rows, total: Number(countResult.rows[0]?.total ?? 0), limit: q.limit, offset: q.offset };
    });

    if ("unavailable" in result) return reply.code(200).send({ rows: [], total: 0, limit: q.limit, offset: q.offset });
    return reply.code(200).send(result);
  });
}


export default fp(async (app) => {
  await registerExpenseRoutes(app);
}, { name: "accounting.registerExpenseRoutes" });
