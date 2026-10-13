import { FactoringPurchaseError, voidPurchase } from "../factoring/purchase.service.js";
import { BANKING_MATCH_OR_CATEGORIZE, FACTORING_RESERVE_ENGINE, LEGACY_FACTORING_WRITERS_RETIRED, sendRetiredFactoringWriter } from "../factoring/retired-factoring-writers.js";
import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import { listFactorReserveBalances, postFactoringFeeExpenseEvent } from "./factoring-fees-posting/poster.service.js";
import {
  postFactoringAdvanceEvent,
  postFactoringCustomerPaymentEvent,
  postFactoringReleaseEvent,
  reverseFactoringAdvanceEvent,
} from "./factoring-posting/poster.service.js";
import {
  getFactoringAdvancePacket,
  getFactoringReserveRollup,
  listFactoringReserveBalances as listFactoringReserveBalancesByAdvance,
} from "./factoring-posting/reserve-tracker.service.js";
import { nextFactoringDisplayId } from "./display-id.js";
import { syncLoadsForFactoringAdvance } from "../dispatch/load-billing-lifecycle.service.js";
import { companyQuerySchema, currentAuthUser, validationError, withCompanyScope, INVOICE_PLEDGE_CENTS_SQL } from "./shared.js";
import { getFactorForCustomer } from "../factoring/factor.service.js";
import { companyBusinessDate } from "../lib/company-business-date.js";
import { requireVoidCancelExecutorWired } from "../lib/authz/void-cancel-authz.js";
import { requireFactoringPurchaseOwner } from "../factoring/owner-only-purchase.js";
import { statusListCondition, statusListParam } from "../lib/status-list.js";

const idParamsSchema = z.object({
  id: z.string().uuid(),
});

const listQuerySchema = companyQuerySchema.extend({
  // GO-23 row16 (owner FINISH LAW 2026-09-03, "voided hidden by default"): "active" is a
  // pseudo-status meaning "any status except voided" -- same convention as
  // payments.routes.ts's status=active -> voided_at IS NULL. Default stays "all" (unchanged) so
  // no other existing caller of this endpoint (e.g. entityPickerRegistry.ts's factoring-advance
  // picker) silently changes behavior; FactoringListPage.tsx is the only caller updated to send
  // "active" explicitly.
  // U12 — multi-select: ?status=a&status=b (one value still accepted); none / "all" = every status; "active" = not voided.
  status: statusListParam(["active", "submitted", "advanced", "reserve_held", "collected", "released", "recourse_returned", "voided", "all"] as const),
  factoring_company_vendor_id: z.string().uuid().optional(),
  date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  search: z.string().trim().optional(),
  // LINK-F5171/LINK-F5184: factoring:accounting.list reverse — a load can find its own advance
  // batch(es) via the invoice it was submitted through (accounting.invoices.factoring_advance_id).
  load_id: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

const createBodySchema = z.object({
  factoring_company_vendor_id: z.string().uuid(),
  submission_batch_ref: z.string().trim().max(200).optional(),
  invoice_ids: z.array(z.string().uuid()).min(1).max(500).optional(),
  // PRE-INVOICE PURCHASE (Lead 2026-10-01 06:50Z, migration 202615170800): the factor bought the load before the TMS
  // may invoice it (owner rule: no invoice on an undelivered load). The advance anchors to the load and its face is the
  // factor's purchase amount; the invoice issued at delivery links itself (trg_invoice_link_pre_invoice_advance).
  load_id: z.string().uuid().optional(),
  purchase_cents: z.coerce.number().int().positive().optional(),
  // FACT-RESERVE-01 STEP 3 — advance_rate_pct is deliberately NOT accepted here. Under the executed
  // Faro agreement it is an OUTPUT of (100 - reserve_pct - factor_fee_pct), never a caller-supplied
  // third number that could drift out of sync with the two real inputs below. A body that still
  // includes it (older FE build, direct API call) is harmless — zod's non-.strict() parse drops it.
  reserve_pct: z.coerce.number().min(0).max(100),
  factor_fee_pct: z.coerce.number().min(0).max(100),
  notes: z.string().trim().max(5000).optional(),
  // ROUND 172 MATCH LAW — when the caller knows the factor's PO string (Faro purchase PO), refuse
  // create unless every invoice's source load carries that exact string on customer_wo_number OR
  // customer_po_number. Optional so the interactive UI still submits without it; Faro feed scripts
  // ALWAYS pass it. Never map on amount+customer.
  expected_customer_po: z.string().trim().min(1).max(120).optional(),
}).superRefine((b, ctx) => {
  const byInvoice = Boolean(b.invoice_ids?.length);
  const byLoad = Boolean(b.load_id);
  if (byInvoice === byLoad) ctx.addIssue({ code: "custom", message: "send invoice_ids OR load_id (pre-invoice purchase), not both and not neither" });
  if (byLoad && !b.purchase_cents) ctx.addIssue({ code: "custom", path: ["purchase_cents"], message: "a pre-invoice purchase needs the factor's purchase amount" });
  if (byLoad && !b.expected_customer_po) ctx.addIssue({ code: "custom", path: ["expected_customer_po"], message: "a pre-invoice purchase must name the factor's PO (ROUND 172 match law)" });
});

/** FACT-PLEDGE-NET-CM — same net as ar-aging (payments + applied non-void credit memos), live not as-of. */
// FACT-DELIVERED-AUTO: INVOICE_PLEDGE_CENTS_SQL now lives in ./shared.js (single source of truth) so
// the delivery auto-submit service computes the identical open-AR pledge base as this create route.

const advanceBodySchema = z.object({
  advanced_at: z.string().datetime().optional(),
  notes: z.string().trim().max(5000).optional(),
});

const reserveHeldBodySchema = z.object({
  collected_at: z.string().datetime().optional(),
  notes: z.string().trim().max(5000).optional(),
});

const releaseBodySchema = z.object({
  released_at: z.string().datetime().optional(),
  factor_fee_cents: z.coerce.number().int().min(0),
  release_amount_cents: z.coerce.number().int().min(0),
  notes: z.string().trim().max(5000).optional(),
});

const recourseBodySchema = z.object({
  recourse_returned_at: z.string().datetime().optional(),
  recourse_reason: z.string().trim().min(3).max(500),
});

const voidBodySchema = z.object({
  reason: z.string().trim().min(3).max(500).optional(),
});

async function fetchAdvanceDetail(client: any, advanceId: string, operatingCompanyId: string) {
  const advanceRes = await client.query(
    `
      SELECT
        fa.*,
        v.vendor_name AS factoring_company_name,
        (
          SELECT COUNT(*)
          FROM accounting.invoices i2
          WHERE i2.factoring_advance_id = fa.id
            AND i2.operating_company_id = fa.operating_company_id
        )::int AS invoice_count,
        (SELECT l.load_number FROM mdata.loads l
          WHERE l.id = fa.source_load_id AND l.operating_company_id = fa.operating_company_id) AS source_load_number,
        (SELECT b.id FROM banking.bank_transactions b
          WHERE b.matched_factoring_advance_id = fa.id
            AND b.operating_company_id = fa.operating_company_id
          ORDER BY b.created_at DESC NULLS LAST
          LIMIT 1) AS matched_bank_transaction_id,
        (SELECT COALESCE(b.description, b.id::text) FROM banking.bank_transactions b
          WHERE b.matched_factoring_advance_id = fa.id
            AND b.operating_company_id = fa.operating_company_id
          ORDER BY b.created_at DESC NULLS LAST
          LIMIT 1) AS matched_bank_transaction_label
      FROM accounting.factoring_advances fa
      -- ENTITY PREDICATE (CLS-JOIN-ENTITY-UNSCOPED): the advance is scoped, the factoring-company
      -- vendor it names was not. This supplies the vendor NAME shown on the advance.
      JOIN mdata.vendors v ON v.id = fa.factoring_company_vendor_id
                          AND v.operating_company_id = fa.operating_company_id
      -- ENTITY PREDICATE (CLS-JOIN-ENTITY-UNSCOPED): the outer WHERE was id-only despite the
      -- comment above claiming "the advance is scoped" -- every OTHER caller of this helper
      -- redundantly re-checks ownership before calling, but the plain GET .../:id route did not,
      -- so this was the one real gap the comment's own claim was hiding.
      WHERE fa.id = $1
        AND fa.operating_company_id = $2::uuid
      LIMIT 1
    `,
    [advanceId, operatingCompanyId]
  );
  const advance = advanceRes.rows[0] ?? null;
  if (!advance) return null;

  const invoicesRes = await client.query(
    `
      SELECT
        i.id,
        i.display_id,
        i.customer_id,
        COALESCE(c.customer_name, c2.customer_name) AS customer_name,
        i.issue_date,
        i.total_cents,
        i.factoring_status
      FROM accounting.invoices i
      -- FACT-CUST-DEACT (owner Decision 2, 2026-09-07) — same class as ACCT-F5787: mdata.customers'
      -- customers_select RLS hides a deactivated customer, so a plain JOIN silently dropped this
      -- invoice from its OWN advance's detail the moment the customer was archived. LEFT JOIN + the
      -- full-row resolver fallback (mdata.get_customer_same_company, only when the RLS-scoped join
      -- missed) keeps the invoice and resolves customer_name regardless of archive state. Never
      -- touches customers_select.
      LEFT JOIN mdata.customers c ON c.id = i.customer_id
                            AND c.operating_company_id = i.operating_company_id
      LEFT JOIN LATERAL (
        SELECT * FROM mdata.get_customer_same_company(i.customer_id, i.operating_company_id)
        WHERE c.id IS NULL
      ) c2 ON true
      WHERE i.factoring_advance_id = $1
        -- ENTITY PREDICATE (CLS-JOIN-ENTITY-UNSCOPED): i itself was read by factoring_advance_id alone,
        -- with no tie back to a company. advance.operating_company_id is already in scope from the
        -- fetch immediately above (same function, no new bind/parameter needed).
        AND i.operating_company_id = $2::uuid
      ORDER BY i.issue_date DESC, i.created_at DESC
    `,
    [advanceId, advance.operating_company_id]
  );

  return {
    ...advance,
    invoice_total_cents: Number(advance.invoice_total_cents ?? 0),
    advance_rate_pct: Number(advance.advance_rate_pct ?? 0),
    advance_amount_cents: Number(advance.advance_amount_cents ?? 0),
    reserve_pct: Number(advance.reserve_pct ?? 0),
    reserve_amount_cents: Number(advance.reserve_amount_cents ?? 0),
    factor_fee_pct: Number(advance.factor_fee_pct ?? 0),
    factor_fee_cents: Number(advance.factor_fee_cents ?? 0),
    release_amount_cents: Number(advance.release_amount_cents ?? 0),
    invoice_count: Number(advance.invoice_count ?? 0),
    invoices: invoicesRes.rows.map((row: Record<string, unknown>) => ({
      ...row,
      total_cents: Number(row.total_cents ?? 0),
    })),
  };
}

export async function registerFactoringAdvancesRoutes(app: FastifyInstance) {
  app.get("/api/v1/accounting/factoring-reserve-balances", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    // ACCT-F5594: no backstop -- listFactorReserveBalances sets app.operating_company_id directly
    // from this caller-supplied value with no membership check of its own, and the underlying
    // factoring_reserve_movements RLS policy only compares against that same GUC (same class as
    // ACCT-F5592/ACCT-F5593).
    await assertCompanyMembership(user.uuid, query.data.operating_company_id);
    const payload = await listFactorReserveBalances({
      operating_company_id: query.data.operating_company_id,
    });
    return payload;
  });

  // CONN-2 — Faro Reserve Tracker (per-advance, structural ledger — accounting.factoring_reserve_movements,
  // migration 202607130000, HELD). Complements the customer-level estimate above (which splits
  // reserve_amount_cents/release_amount_cents proportionally off the advance header, no JE linkage) with
  // the true per-advance HELD/RELEASED events and their journal_entry_id. Read-only; not flag-gated.
  app.get("/api/v1/accounting/factoring-advances/reserve-tracker", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (LEGACY_FACTORING_WRITERS_RETIRED) return sendRetiredFactoringWriter(reply, "GET /api/v1/accounting/factoring-advances/reserve-tracker (second reserve reader)", FACTORING_RESERVE_ENGINE);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    // ACCT-F5594: no backstop -- same class as GET /factoring-reserve-balances above.
    await assertCompanyMembership(user.uuid, query.data.operating_company_id);
    const [balances, rollup] = await Promise.all([
      listFactoringReserveBalancesByAdvance(query.data.operating_company_id),
      getFactoringReserveRollup(query.data.operating_company_id),
    ]);
    return { rollup, advances: balances };
  });

  // CONN-2 — Advance Packet: advance header + linked invoices/loads + reserve ledger + interest ledger in
  // one read (Law of the Land §10a forward+reverse drill-through). Read-only; not flag-gated.
  app.get("/api/v1/accounting/factoring-advances/:id/packet", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    // ACCT-F5594: no backstop -- same class as GET /factoring-reserve-balances above.
    await assertCompanyMembership(user.uuid, query.data.operating_company_id);
    const packet = await getFactoringAdvancePacket(query.data.operating_company_id, params.data.id);
    if (!packet) return reply.code(404).send({ error: "factoring_advance_not_found" });
    return packet;
  });

  // Rate-limited (CodeQL js/missing-rate-limiting). Pre-existing gap surfaced because this PR touched
  // the file; the plugin is registered global:false, so an un-configured route has NO limit at all.
  app.get("/api/v1/accounting/factoring-advances", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = listQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const q = query.data;

    const rows = await withCompanyScope(user.uuid, q.operating_company_id, async (client) => {
      const where: string[] = ["fa.operating_company_id = $1::uuid"];
      const values: unknown[] = [q.operating_company_id];
      const statusCond = q.status?.includes("all")
        ? null
        : statusListCondition("fa.status", q.status, (v) => {
            values.push(v);
            return `$${values.length}`;
          }, { notVoidedPseudo: { value: "active", excludes: ["voided"] } });
      if (statusCond) where.push(statusCond);
      if (q.factoring_company_vendor_id) {
        values.push(q.factoring_company_vendor_id);
        where.push(`fa.factoring_company_vendor_id = $${values.length}`);
      }
      if (q.date_from) {
        values.push(q.date_from);
        where.push(`fa.submitted_at >= $${values.length}::date`);
      }
      if (q.date_to) {
        values.push(q.date_to);
        where.push(`fa.submitted_at <= $${values.length}::date + interval '1 day' - interval '1 second'`);
      }
      if (q.search) {
        values.push(`%${q.search}%`);
        const idx = values.length;
        where.push(`(fa.display_id ILIKE $${idx} OR COALESCE(fa.submission_batch_ref, '') ILIKE $${idx})`);
      }
      if (q.load_id) {
        values.push(q.load_id);
        // Load -> its advances: through the invoice it was submitted on, OR directly when the factor bought the
        // load before it could be invoiced (source_load_id, migration 202615170800).
        where.push(
          `(fa.source_load_id = $${values.length}::uuid OR EXISTS (
             SELECT 1 FROM accounting.invoices i
             WHERE i.factoring_advance_id = fa.id
               AND i.operating_company_id = fa.operating_company_id
               AND i.source_load_id = $${values.length}::uuid
           ))`
        );
      }
      values.push(q.limit);
      const limitIdx = values.length;

      const res = await client.query(
        `
          SELECT
            fa.*,
            v.vendor_name AS factoring_company_name,
            (
              SELECT COUNT(*)
              FROM accounting.invoices i
              WHERE i.factoring_advance_id = fa.id
                AND i.operating_company_id = fa.operating_company_id
            )::int AS invoice_count
          -- CLS-JOIN-ENTITY-UNSCOPED: where[0] is always "fa.operating_company_id = $1::uuid" (set
          -- unconditionally above), so this is already scoped at runtime -- the static entity-scope
          -- guard cannot see a predicate assembled through a JS array, only literal SQL text, so a
          -- redundant AND fa.operating_company_id = $1::uuid is added directly here.
          FROM accounting.factoring_advances fa
          JOIN mdata.vendors v ON v.id = fa.factoring_company_vendor_id
                              AND v.operating_company_id = fa.operating_company_id
          WHERE fa.operating_company_id = $1::uuid AND ${where.join(" AND ")}
          ORDER BY fa.submitted_at DESC, fa.created_at DESC
          LIMIT $${limitIdx}
        `,
        values
      );
      // R-102-B item 5 — disclosed count: company-wide, independent of every non-status filter.
      const voidedRes = await client.query(
        `SELECT count(*) AS n FROM accounting.factoring_advances
          WHERE operating_company_id = $1::uuid AND status = 'voided'`,
        [q.operating_company_id]
      );
      return { rows: res.rows, voidedCount: Number(voidedRes.rows[0]?.n ?? 0) };
    });

    return {
      rows: rows.rows.map((row: Record<string, unknown>) => ({
        ...row,
        invoice_total_cents: Number(row.invoice_total_cents ?? 0),
        advance_rate_pct: Number(row.advance_rate_pct ?? 0),
        advance_amount_cents: Number(row.advance_amount_cents ?? 0),
        reserve_pct: Number(row.reserve_pct ?? 0),
        reserve_amount_cents: Number(row.reserve_amount_cents ?? 0),
        factor_fee_pct: Number(row.factor_fee_pct ?? 0),
        factor_fee_cents: Number(row.factor_fee_cents ?? 0),
        release_amount_cents: Number(row.release_amount_cents ?? 0),
        invoice_count: Number(row.invoice_count ?? 0),
      })),
      voided_count: rows.voidedCount,
    };
  });

  app.get("/api/v1/accounting/factoring-advances/candidate-invoices", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const rows = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          SELECT
            i.id,
            i.display_id,
            i.customer_id,
            COALESCE(c.customer_name, c2.customer_name) AS customer_name,
            i.issue_date,
            i.total_cents,
            (${INVOICE_PLEDGE_CENTS_SQL})::bigint AS pledge_cents,
            COALESCE(i.factoring_status, 'not_factored') AS factoring_status,
            COALESCE(c.factoring_recourse_type, c2.factoring_recourse_type, 'recourse') AS customer_recourse_type,
            COALESCE(c.factoring_eligible, c2.factoring_eligible) AS factoring_eligible
          FROM accounting.invoices i
          -- FACT-CUST-DEACT (owner Decision 2, 2026-09-07) — same class as ACCT-F5787: a deactivated but
          -- factoring-eligible customer's sendable invoice must still be OFFERED here, not silently
          -- hidden by customers_select RLS. LEFT JOIN + full-row resolver fallback; the eligibility gate
          -- below reads through COALESCE(c, c2) so archive state alone never removes a factorable invoice.
          LEFT JOIN mdata.customers c ON c.id = i.customer_id
                                AND c.operating_company_id = i.operating_company_id
          LEFT JOIN LATERAL (
            SELECT * FROM mdata.get_customer_same_company(i.customer_id, i.operating_company_id)
            WHERE c.id IS NULL
          ) c2 ON true
          WHERE i.operating_company_id = $1::uuid
            AND i.status = 'sent'
            AND i.voided_at IS NULL
            AND COALESCE(i.factoring_status, 'not_factored') = 'not_factored'
            AND COALESCE(c.factoring_eligible, c2.factoring_eligible) = true
          ORDER BY i.issue_date DESC, i.created_at DESC
          LIMIT 500
        `,
        [query.data.operating_company_id]
      );
      return res.rows;
    });

    return {
      rows: rows.map((row: Record<string, unknown>) => ({
        ...row,
        total_cents: Number(row.total_cents ?? 0),
        pledge_cents: Number(row.pledge_cents ?? row.total_cents ?? 0),
      })),
    };
  });

  app.get("/api/v1/accounting/factoring-advances/:id", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const detail = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      return fetchAdvanceDetail(client, params.data.id, query.data.operating_company_id);
    });
    if (!detail) return reply.code(404).send({ error: "factoring_advance_not_found" });
    return detail;
  });

  app.post("/api/v1/accounting/factoring-advances", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (LEGACY_FACTORING_WRITERS_RETIRED) return sendRetiredFactoringWriter(reply, "POST /api/v1/accounting/factoring-advances (legacy create)");
    // ACCT-F5578: this route (and 4 siblings below) had no role gate -- currentAuthUser only requires
    // a session. Reusing the file's own void/cancel executor role set (Owner/Administrator/Accountant,
    // Jorge-locked 2026-06-29) since creating/advancing/holding/releasing a factoring advance is the
    // same tier of financial-executor operation as this file's own already-gated void route.
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const body = createBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    const allowedCreate = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) =>
      requireVoidCancelExecutorWired(reply, {
        role: String(user.role ?? ""),
        client,
        // no factoring.* permission seeded — role floor until catalog grows
        operatingCompanyId: query.data.operating_company_id,
        userUuid: user.uuid,
      })
    );
    if (!allowedCreate) return;
    // ROUND 315 OWNER-ONLY LAW: only the Owner creates, closes or matches a purchase (403 + audit row).
    const ownerOkCreate = await withCompanyScope(user.uuid, query.data.operating_company_id, (client) =>
      requireFactoringPurchaseOwner(reply, client, {
        operatingCompanyId: query.data.operating_company_id,
        userUuid: user.uuid,
        role: String(user.role ?? ""),
        action: "create",
        targetId: null,
      })
    );
    if (!ownerOkCreate) return;

    const result = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const vendorRes = await client.query(
        `
          SELECT id
          FROM mdata.vendors
          WHERE id = $1
            AND operating_company_id = $2::uuid
            AND deactivated_at IS NULL
          LIMIT 1
        `,
        [body.data.factoring_company_vendor_id, query.data.operating_company_id]
      );
      if (!vendorRes.rows[0]) return { code: 404 as const, error: "factoring_vendor_not_found" };

      if (body.data.load_id) {
        const loadRes = await client.query(
          `
            SELECT l.id::text, l.load_number, l.customer_wo_number, l.customer_po_number,
                   COALESCE(c.factoring_eligible, c2.factoring_eligible) AS factoring_eligible,
                   (SELECT count(*)::int FROM accounting.invoices i
                     WHERE i.source_load_id = l.id AND i.operating_company_id = l.operating_company_id AND i.voided_at IS NULL) AS live_invoices,
                   (SELECT count(*)::int FROM accounting.factoring_advances a
                     WHERE a.source_load_id = l.id AND a.operating_company_id = l.operating_company_id AND a.voided_at IS NULL) AS open_advances
              FROM mdata.loads l
              LEFT JOIN mdata.customers c ON c.id = l.customer_id AND c.operating_company_id = l.operating_company_id
              LEFT JOIN LATERAL (
                SELECT * FROM mdata.get_customer_same_company(l.customer_id, l.operating_company_id) WHERE c.id IS NULL
              ) c2 ON true
             WHERE l.id = $1::uuid AND l.operating_company_id = $2::uuid AND l.soft_deleted_at IS NULL
          `,
          [body.data.load_id, query.data.operating_company_id]
        );
        const load = loadRes.rows[0] as
          | { id: string; load_number: string; customer_wo_number: string | null; customer_po_number: string | null;
              factoring_eligible: boolean | null; live_invoices: number; open_advances: number }
          | undefined;
        if (!load) return { code: 404 as const, error: "load_not_found" };
        if (!load.factoring_eligible) return { code: 409 as const, error: "customer_not_factoring_eligible" };
        // A live invoice means the invoice path applies (it carries the pledge base); a second open advance would
        // pledge the same trip twice.
        if (load.live_invoices > 0) return { code: 409 as const, error: "load_has_live_invoice_use_invoice_ids" };
        if (load.open_advances > 0) return { code: 409 as const, error: "load_already_has_open_advance" };
        const poWant = body.data.expected_customer_po!;
        if ((load.customer_wo_number ?? "") !== poWant && (load.customer_po_number ?? "") !== poWant) {
          return {
            code: 409 as const,
            error: "factoring_po_mismatch",
            detail: { expected_customer_po: poWant, load_number: load.load_number, customer_wo_number: load.customer_wo_number, customer_po_number: load.customer_po_number },
          };
        }
        const face = body.data.purchase_cents!;
        const reserveAmount = Math.round((face * Number(body.data.reserve_pct)) / 100);
        const feeAmount = Math.round((face * Number(body.data.factor_fee_pct)) / 100);
        const advanceAmount = face - reserveAmount - feeAmount;
        const advanceRatePctDerived = face > 0 ? Number(((advanceAmount / face) * 100).toFixed(2)) : 0;
        const displayId = await nextFactoringDisplayId(client, query.data.operating_company_id, new Date());
        const ins = await client.query(
          `
            INSERT INTO accounting.factoring_advances (
              operating_company_id, factoring_company_vendor_id, display_id, status, submission_batch_ref,
              invoice_total_cents, advance_rate_pct, advance_amount_cents, reserve_pct, reserve_amount_cents,
              factor_fee_pct, factor_fee_cents, notes, memo, created_by_user_id, source_load_id
            )
            VALUES ($1,$2,$3,'submitted',$4,$5,$6,$7,$8,$9,$10,$11,$12,$12,$13,$14::uuid)
            RETURNING id
          `,
          [
            query.data.operating_company_id, body.data.factoring_company_vendor_id, displayId, body.data.submission_batch_ref ?? null,
            face, advanceRatePctDerived, advanceAmount, body.data.reserve_pct, reserveAmount, body.data.factor_fee_pct, feeAmount,
            body.data.notes ?? null, user.uuid, load.id,
          ]
        );
        const advanceId = String(ins.rows[0]?.id ?? "");
        if (!advanceId) return { code: 500 as const, error: "factoring_advance_create_failed" };
        await appendCrudAudit(
          client,
          user.uuid,
          "accounting.factoring_submitted",
          { resource_type: "accounting.factoring_advances", resource_id: advanceId, operating_company_id: query.data.operating_company_id, display_id: displayId, pre_invoice_load_id: load.id, load_number: load.load_number, purchase_cents: face },
          "info",
          "P3-T11.20.5-FACTORING"
        );
        const detail = await fetchAdvanceDetail(client, advanceId, query.data.operating_company_id);
        return { code: 201 as const, data: detail };
      }
      const invoiceIds = body.data.invoice_ids!;

      const invoiceRes = await client.query(
        `
          SELECT
            i.id,
            i.customer_id,
            i.total_cents,
            (${INVOICE_PLEDGE_CENTS_SQL})::bigint AS pledge_cents,
            i.status,
            COALESCE(i.factoring_status, 'not_factored') AS factoring_status,
            COALESCE(c.factoring_eligible, c2.factoring_eligible) AS factoring_eligible
          FROM accounting.invoices i
          -- FACT-CUST-DEACT (owner Decision 2, 2026-09-07) — same class as ACCT-F5787. The plain JOIN
          -- here meant customers_select RLS (deactivated_at IS NULL) dropped a real, in-scope invoice
          -- whose customer had been archived, so the length check below fired a PHANTOM invoice_not_found
          -- (404) — the exact symptom the owner hit factoring PFL/Ostt. LEFT JOIN + the full-row resolver
          -- keeps the invoice AND resolves factoring_eligible even when archived, so an eligible customer
          -- factors without being un-archived, and the eligibility gate (not a phantom 404) is what
          -- speaks when it truly is ineligible. customers_select is never modified.
          LEFT JOIN mdata.customers c ON c.id = i.customer_id
                                AND c.operating_company_id = i.operating_company_id
          LEFT JOIN LATERAL (
            SELECT * FROM mdata.get_customer_same_company(i.customer_id, i.operating_company_id)
            WHERE c.id IS NULL
          ) c2 ON true
          WHERE i.operating_company_id = $1::uuid
            AND i.id = ANY($2::uuid[])
        `,
        [query.data.operating_company_id, invoiceIds]
      );
      if (invoiceRes.rows.length !== invoiceIds.length) return { code: 404 as const, error: "invoice_not_found" };
      for (const row of invoiceRes.rows as Array<Record<string, unknown>>) {
        if (String(row.status) !== "sent") return { code: 409 as const, error: "invoice_not_sent" };
        if (String(row.factoring_status) !== "not_factored") return { code: 409 as const, error: "invoice_already_factored" };
        if (!row.factoring_eligible) return { code: 409 as const, error: "customer_not_factoring_eligible" };
        if (Number(row.total_cents ?? 0) === 0) return { code: 409 as const, error: "zero_revenue_invoice_not_factorable" };
        if (Number(row.pledge_cents ?? 0) <= 0) return { code: 409 as const, error: "invoice_zero_open" };
      }

      // ROUND 172 MATCH LAW — refuse when the caller's factor PO does not EXACTLY match the load's
      // customer_wo_number or customer_po_number. Amount+customer alone never authorizes a feed.
      if (body.data.expected_customer_po) {
        const poWant = body.data.expected_customer_po;
        const poRes = await client.query(
          `
            SELECT
              i.id::text AS invoice_id,
              l.load_number,
              l.customer_wo_number,
              l.customer_po_number
            FROM accounting.invoices i
            LEFT JOIN mdata.loads l
              ON l.id = i.source_load_id
             AND l.operating_company_id = i.operating_company_id
            WHERE i.operating_company_id = $1::uuid
              AND i.id = ANY($2::uuid[])
          `,
          [query.data.operating_company_id, invoiceIds]
        );
        for (const row of poRes.rows as Array<{
          invoice_id: string;
          load_number: string | null;
          customer_wo_number: string | null;
          customer_po_number: string | null;
        }>) {
          const wo = row.customer_wo_number ?? "";
          const po = row.customer_po_number ?? "";
          if (wo !== poWant && po !== poWant) {
            return {
              code: 409 as const,
              error: "factoring_po_mismatch",
              detail: {
                expected_customer_po: poWant,
                load_number: row.load_number,
                customer_wo_number: row.customer_wo_number,
                customer_po_number: row.customer_po_number,
                invoice_id: row.invoice_id,
              },
            };
          }
        }
      }

      // FACT-PLEDGE-NET-CM: Faro face / reserve / fee base = open AR, not invoice header total.
      const invoiceTotalCents = invoiceRes.rows.reduce(
        (sum: number, row: Record<string, unknown>) => sum + Number(row.pledge_cents ?? 0),
        0
      );
      // FACT-RESERVE-01 (GO-FARO-02 REV B) — reserve was computed as "whatever the advance didn't
      // cover" (invoiceTotal - advance), which folds the ENTIRE holdback into reserve_amount_cents and
      // leaves factor_fee_cents permanently 0 (it was never even in the INSERT column list below).
      // Balanced (invoice total still reconciles) but wrong: the factoring fee expense never posts,
      // and reserve_amount_cents is overstated by the fee. Both must be computed independently from
      // their own caller-supplied percentages, per the packet's own prescribed formula.
      const reserveAmount = Math.round((invoiceTotalCents * Number(body.data.reserve_pct)) / 100);
      const feeAmount = Math.round((invoiceTotalCents * Number(body.data.factor_fee_pct)) / 100);
      // FACT-RESERVE-01 STEP 3 (owner work order 2026-08-30) — under the executed Faro agreement
      // there is NO independent "advance rate" input: "Purchase Price = Net - Fee - Reserve" and the
      // 97% on Faro's statement header is an OUTPUT of (1 - 1.5% - 1.5%), not a third number a caller
      // supplies alongside reserve_pct/factor_fee_pct. Accepting advance_rate_pct as its own input let
      // it silently drift out of sync with reserve_pct + factor_fee_pct (the original class of bug
      // this whole finding is about, just one level up). advanceAmount is now the complement of the
      // two REAL inputs, by construction — it can never disagree with reserve+fee again.
      const advanceAmount = invoiceTotalCents - reserveAmount - feeAmount;
      // advance_rate_pct is stored purely for display/reporting (e.g. "97.00%" on the batch header) —
      // derived from the actual cents, not re-multiplied, so it always reflects what really posted.
      const advanceRatePctDerived =
        invoiceTotalCents > 0 ? Number(((advanceAmount / invoiceTotalCents) * 100).toFixed(2)) : 0;
      const displayId = await nextFactoringDisplayId(client, query.data.operating_company_id, new Date());

      const insertRes = await client.query(
        `
          INSERT INTO accounting.factoring_advances (
            operating_company_id,
            factoring_company_vendor_id,
            display_id,
            status,
            submission_batch_ref,
            invoice_total_cents,
            advance_rate_pct,
            advance_amount_cents,
            reserve_pct,
            reserve_amount_cents,
            factor_fee_pct,
            factor_fee_cents,
            notes,
            memo,
            created_by_user_id
          )
          VALUES ($1,$2,$3,'submitted',$4,$5,$6,$7,$8,$9,$10,$11,$12,$12,$13)
          RETURNING id
        `,
        [
          query.data.operating_company_id,
          body.data.factoring_company_vendor_id,
          displayId,
          body.data.submission_batch_ref ?? null,
          invoiceTotalCents,
          advanceRatePctDerived,
          advanceAmount,
          body.data.reserve_pct,
          reserveAmount,
          body.data.factor_fee_pct,
          feeAmount,
          body.data.notes ?? null,
          user.uuid,
        ]
      );
      const advanceId = String(insertRes.rows[0]?.id ?? "");
      if (!advanceId) return { code: 500 as const, error: "factoring_advance_create_failed" };

      // T4 (ROUND 124): factor_profile_id was never written on this (manual batch-submit) path —
      // the caller supplies a vendor_id (who gets paid), not a factoring.factor.id (the pricing
      // profile invoices.factor_profile_id FKs to; that table has no vendor-linkage column, so a
      // vendor_id cannot be mapped to it directly). Resolve the SAME way the auto-submit path
      // already does (getFactorForCustomer — no new resolution logic), per invoice's own customer
      // and as-of the business date, cached per customer since a batch can span customers. A
      // customer genuinely unassigned as of today resolves to null — left NULL on the invoice,
      // which is the correct value, not a defect (never invented).
      const asOfSubmit = companyBusinessDate();
      const factorIdByCustomer = new Map<string, string | null>();
      for (const row of invoiceRes.rows as Array<Record<string, unknown>>) {
        const customerId = String(row.customer_id);
        if (factorIdByCustomer.has(customerId)) continue;
        const factor = await getFactorForCustomer(query.data.operating_company_id, customerId, asOfSubmit, { client });
        factorIdByCustomer.set(customerId, factor?.id ?? null);
      }

      for (const row of invoiceRes.rows as Array<Record<string, unknown>>) {
        const factorProfileId = factorIdByCustomer.get(String(row.customer_id)) ?? null;
        await client.query(
          `
            UPDATE accounting.invoices
            SET factoring_advance_id = $2,
                factoring_status = 'submitted',
                factor_profile_id = $5,
                updated_at = now(),
                updated_by_user_id = $3
            WHERE operating_company_id = $1::uuid
              AND id = $4
          `,
          [query.data.operating_company_id, advanceId, user.uuid, row.id, factorProfileId]
        );
      }

      await appendCrudAudit(
        client,
        user.uuid,
        "accounting.factoring_submitted",
        {
          resource_type: "accounting.factoring_advances",
          resource_id: advanceId,
          operating_company_id: query.data.operating_company_id,
          display_id: displayId,
          invoice_count: invoiceIds.length,
        },
        "info",
        "P3-T11.20.5-FACTORING"
      );

      const detail = await fetchAdvanceDetail(client, advanceId, query.data.operating_company_id);
      return { code: 201 as const, data: detail };
    });

    if ("error" in result) {
      const payload: Record<string, unknown> = { error: result.error };
      if ("detail" in result && result.detail != null) payload.detail = result.detail;
      return reply.code(result.code).send(payload);
    }
    return reply.code(result.code).send(result.data);
  });

  app.post("/api/v1/accounting/factoring-advances/:id/advance", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (LEGACY_FACTORING_WRITERS_RETIRED) return sendRetiredFactoringWriter(reply, "POST /api/v1/accounting/factoring-advances/:id/advance (Mark Advanced)");
    // ACCT-F5578: see the create route above for why this reuses the void/cancel executor role set.
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const body = advanceBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    const allowedAdvance = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) =>
      requireVoidCancelExecutorWired(reply, {
        role: String(user.role ?? ""),
        client,
        // no factoring.* permission seeded — role floor until catalog grows
        operatingCompanyId: query.data.operating_company_id,
        userUuid: user.uuid,
      })
    );
    if (!allowedAdvance) return;
    // ROUND 315 OWNER-ONLY LAW: only the Owner creates, closes or matches a purchase (403 + audit row).
    const ownerOkAdvance = await withCompanyScope(user.uuid, query.data.operating_company_id, (client) =>
      requireFactoringPurchaseOwner(reply, client, {
        operatingCompanyId: query.data.operating_company_id,
        userUuid: user.uuid,
        role: String(user.role ?? ""),
        action: "advance",
        targetId: params.data.id,
      })
    );
    if (!ownerOkAdvance) return;

    const result = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const advanceRes = await client.query(`SELECT * FROM accounting.factoring_advances WHERE id = $1 AND operating_company_id = $2::uuid LIMIT 1`, [
        params.data.id,
        query.data.operating_company_id,
      ]);
      const advance = advanceRes.rows[0] ?? null;
      if (!advance) return { code: 404 as const, error: "factoring_advance_not_found" };
      if (String(advance.status) !== "submitted") return { code: 409 as const, error: "factoring_status_invalid_transition" };

      const at = body.data.advanced_at ?? new Date().toISOString();
      await client.query(
        `
          UPDATE accounting.invoices
          SET factoring_status = 'advanced',
              updated_at = now(),
              updated_by_user_id = $2
          WHERE factoring_advance_id = $1
        `,
        [params.data.id, user.uuid]
      );
      // ACCT-F5651 — postFactoringAdvanceEvent opens its OWN connection and, on its write path,
      // takes `SELECT ... FOR UPDATE` on this exact `factoring_advances` row. Previously this
      // route's own `UPDATE accounting.factoring_advances SET status = ...` ran BEFORE this call,
      // taking and holding that row's lock on THIS connection for the poster's entire duration —
      // an application-level deadlock cycle Postgres's own detector cannot see (this connection is
      // synchronously awaiting the poster's promise; the poster's connection is blocked on this
      // connection's uncommitted row lock). Prod has statement_timeout=0/lock_timeout=0, so the
      // blocked query hangs indefinitely rather than erroring — the same class ACCT-F5637 already
      // fixed for the bill-payment void executor. The poster never reads/gates on
      // `factoring_advances.status` (only its own idempotency posting-keys), so moving THIS
      // route's status UPDATE to run AFTER the poster call is behavior-neutral and removes the
      // lock-order conflict entirely — by the time this connection ever touches the row, the
      // poster's connection has already committed and released its lock.
      await postFactoringAdvanceEvent({
        operating_company_id: query.data.operating_company_id,
        factoring_advance_id: params.data.id,
        actor_user_id: user.uuid,
        advanced_at_iso: at,
      });
      await client.query(
        `
          UPDATE accounting.factoring_advances
          SET status = 'advanced',
              advanced_at = $2::timestamptz,
              notes = COALESCE($3, notes)
          WHERE id = $1
        `,
        [params.data.id, at, body.data.notes ?? null]
      );

      await appendCrudAudit(
        client,
        user.uuid,
        "accounting.factoring_advanced",
        {
          resource_type: "accounting.factoring_advances",
          resource_id: params.data.id,
          operating_company_id: query.data.operating_company_id,
        },
        "info",
        "P3-T11.20.5-FACTORING"
      );
      return { code: 200 as const, data: await fetchAdvanceDetail(client, params.data.id, query.data.operating_company_id) };
    });
    if ("error" in result) return reply.code(result.code).send({ error: result.error });
    // LOAD-CLOSE-LIFECYCLE — the advance just funded (`advanced`) and its invoice(s) were flipped to
    // factoring_status='advanced' INSIDE the committed txn above. Now, post-commit on its own
    // connection (so it observes the committed 'advanced' and never contends for the advance row's
    // lock the poster just released — ACCT-F5651), close the delivered load(s) behind those invoices.
    // Idempotent + swallow-and-log: a factoring hiccup here never fails the advance.
    await syncLoadsForFactoringAdvance({
      operatingCompanyId: query.data.operating_company_id,
      factoringAdvanceId: params.data.id,
      actorUserId: user.uuid,
    });
    return result.data;
  });

  app.post("/api/v1/accounting/factoring-advances/:id/reserve-held", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (LEGACY_FACTORING_WRITERS_RETIRED) return sendRetiredFactoringWriter(reply, "POST /api/v1/accounting/factoring-advances/:id/reserve-held", BANKING_MATCH_OR_CATEGORIZE);
    // ACCT-F5578: see the create route above for why this reuses the void/cancel executor role set.
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const body = reserveHeldBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    const allowedReserveHeld = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) =>
      requireVoidCancelExecutorWired(reply, {
        role: String(user.role ?? ""),
        client,
        // no factoring.* permission seeded — role floor until catalog grows
        operatingCompanyId: query.data.operating_company_id,
        userUuid: user.uuid,
      })
    );
    if (!allowedReserveHeld) return;
    // ROUND 315 OWNER-ONLY LAW: only the Owner creates, closes or matches a purchase (403 + audit row).
    const ownerOkReserveHeld = await withCompanyScope(user.uuid, query.data.operating_company_id, (client) =>
      requireFactoringPurchaseOwner(reply, client, {
        operatingCompanyId: query.data.operating_company_id,
        userUuid: user.uuid,
        role: String(user.role ?? ""),
        action: "reserve_held",
        targetId: params.data.id,
      })
    );
    if (!ownerOkReserveHeld) return;

    const result = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const advanceRes = await client.query(`SELECT * FROM accounting.factoring_advances WHERE id = $1 AND operating_company_id = $2::uuid LIMIT 1`, [
        params.data.id,
        query.data.operating_company_id,
      ]);
      const advance = advanceRes.rows[0] ?? null;
      if (!advance) return { code: 404 as const, error: "factoring_advance_not_found" };
      if (!["advanced", "submitted"].includes(String(advance.status))) return { code: 409 as const, error: "factoring_status_invalid_transition" };

      const collectedAt = body.data.collected_at ?? new Date().toISOString();
      await client.query(
        `
          UPDATE accounting.invoices
          SET factoring_status = 'reserve_held',
              updated_at = now(),
              updated_by_user_id = $2
          WHERE factoring_advance_id = $1
        `,
        [params.data.id, user.uuid]
      );
      // WIRE the built-but-unwired customer-payment poster (Law of the Land: no built-but-unwired poster).
      // The reserve_held transition IS the "customer paid the factor directly" event (notification
      // factoring): the collected_at is stamped here. Under the secured-borrowing model this is the ONLY
      // place A/R goes down — Dr Factoring-Advance-Liability / Cr A/R, for the full pledged invoice Net
      // (invoice_total_cents = the amount the customer pays Faro). Flag-gated + idempotent inside the poster;
      // a flag-OFF entity no-ops. Any default interest that compounded into the liability (late payment) is
      // intentionally left outstanding — the customer only ever pays the invoice face; the residual accrued
      // interest is the Seller's to settle with Faro (see PR body / open item).
      // ACCT-F5651 — postFactoringCustomerPaymentEvent opens its OWN connection and takes
      // `SELECT ... FOR UPDATE` on this exact `factoring_advances` row on its write path.
      // Previously this route's own status UPDATE ran BEFORE this call, holding that row's lock on
      // THIS connection for the poster's entire duration — an application-level deadlock cycle
      // Postgres cannot see (same class ACCT-F5637 already fixed elsewhere). The poster never
      // reads/gates on `factoring_advances.status`, so moving the status UPDATE to run AFTER the
      // poster call is behavior-neutral and removes the lock-order conflict.
      await postFactoringCustomerPaymentEvent({
        operating_company_id: query.data.operating_company_id,
        factoring_advance_id: params.data.id,
        actor_user_id: user.uuid,
        amount_cents: Number(advance.invoice_total_cents ?? 0),
        paid_at_iso: collectedAt,
      });
      await client.query(
        `
          UPDATE accounting.factoring_advances
          SET status = 'reserve_held',
              collected_at = $2::timestamptz,
              notes = COALESCE($3, notes)
          WHERE id = $1
        `,
        [params.data.id, collectedAt, body.data.notes ?? null]
      );
      await appendCrudAudit(
        client,
        user.uuid,
        "accounting.factoring_reserve_held",
        {
          resource_type: "accounting.factoring_advances",
          resource_id: params.data.id,
          operating_company_id: query.data.operating_company_id,
        },
        "info",
        "P3-T11.20.5-FACTORING"
      );
      return { code: 200 as const, data: await fetchAdvanceDetail(client, params.data.id, query.data.operating_company_id) };
    });
    if ("error" in result) return reply.code(result.code).send({ error: result.error });
    return result.data;
  });

  app.post("/api/v1/accounting/factoring-advances/:id/release", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (LEGACY_FACTORING_WRITERS_RETIRED) return sendRetiredFactoringWriter(reply, "POST /api/v1/accounting/factoring-advances/:id/release", BANKING_MATCH_OR_CATEGORIZE);
    // ACCT-F5578: see the create route above for why this reuses the void/cancel executor role set.
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const body = releaseBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    const allowedRelease = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) =>
      requireVoidCancelExecutorWired(reply, {
        role: String(user.role ?? ""),
        client,
        // no factoring.* permission seeded — role floor until catalog grows
        operatingCompanyId: query.data.operating_company_id,
        userUuid: user.uuid,
      })
    );
    if (!allowedRelease) return;
    // ROUND 315 OWNER-ONLY LAW: only the Owner creates, closes or matches a purchase (403 + audit row).
    const ownerOkRelease = await withCompanyScope(user.uuid, query.data.operating_company_id, (client) =>
      requireFactoringPurchaseOwner(reply, client, {
        operatingCompanyId: query.data.operating_company_id,
        userUuid: user.uuid,
        role: String(user.role ?? ""),
        action: "release",
        targetId: params.data.id,
      })
    );
    if (!ownerOkRelease) return;

    const result = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const advanceRes = await client.query(`SELECT * FROM accounting.factoring_advances WHERE id = $1 AND operating_company_id = $2::uuid LIMIT 1`, [
        params.data.id,
        query.data.operating_company_id,
      ]);
      const advance = advanceRes.rows[0] ?? null;
      if (!advance) return { code: 404 as const, error: "factoring_advance_not_found" };
      if (!["reserve_held", "collected"].includes(String(advance.status))) return { code: 409 as const, error: "factoring_status_invalid_transition" };

      const invoicesRes = await client.query(
        `
          SELECT id, customer_id, total_cents
          FROM accounting.invoices
          WHERE factoring_advance_id = $1
            AND operating_company_id = $2::uuid
          ORDER BY issue_date ASC, created_at ASC
        `,
        [params.data.id, query.data.operating_company_id]
      );
      const invoices = invoicesRes.rows.map((row: Record<string, unknown>) => ({
        invoice_id: String(row.id),
        customer_id: String(row.customer_id),
        total_cents: Number(row.total_cents ?? 0),
      }));
      if (invoices.length === 0) return { code: 409 as const, error: "factoring_advance_has_no_invoices" };

      const releasedAt = body.data.released_at ?? new Date().toISOString();
      await client.query(
        `
          UPDATE accounting.invoices
          SET factoring_status = 'released',
              updated_at = now(),
              updated_by_user_id = $2
          WHERE factoring_advance_id = $1
        `,
        [params.data.id, user.uuid]
      );
      // ACCT-F5651 — postFactoringReleaseEvent opens its OWN connection and takes
      // `SELECT ... FOR UPDATE` on this exact `factoring_advances` row on its write path.
      // Previously this route's own status UPDATE ran BEFORE this call, holding that row's lock on
      // THIS connection for the poster's entire duration — an application-level deadlock cycle
      // Postgres cannot see (same class ACCT-F5637 already fixed elsewhere). The poster never
      // reads/gates on `factoring_advances.status`, so moving the status UPDATE to run AFTER the
      // poster call is behavior-neutral and removes the lock-order conflict.
      // (postFactoringFeeExpenseEvent below is a documented pure no-op — no DB connection at all —
      // so it carries no lock risk either way.)
      await postFactoringReleaseEvent({
        operating_company_id: query.data.operating_company_id,
        factoring_advance_id: params.data.id,
        actor_user_id: user.uuid,
        released_at_iso: releasedAt,
        release_amount_cents: Number(body.data.release_amount_cents ?? 0),
        factor_fee_cents: Number(body.data.factor_fee_cents ?? 0),
      });
      await postFactoringFeeExpenseEvent({
        operating_company_id: query.data.operating_company_id,
        factoring_advance_id: params.data.id,
        factor_fee_cents: Number(body.data.factor_fee_cents ?? 0),
        released_at_iso: releasedAt,
        actor: {
          user_id: user.uuid,
          role: user.role,
        },
      });
      await client.query(
        `
          UPDATE accounting.factoring_advances
          SET status = 'released',
              released_at = $2::timestamptz,
              factor_fee_cents = $3,
              release_amount_cents = $4,
              notes = COALESCE($5, notes)
          WHERE id = $1
        `,
        [params.data.id, releasedAt, body.data.factor_fee_cents, body.data.release_amount_cents, body.data.notes ?? null]
      );

      const invoiceTotal = Number(advance.invoice_total_cents ?? 0);
      const advanceTotal = Number(advance.advance_amount_cents ?? 0);
      const reserveTotal = Number(advance.reserve_amount_cents ?? 0);

      await appendCrudAudit(
        client,
        user.uuid,
        "accounting.factoring_released",
        {
          resource_type: "accounting.factoring_advances",
          resource_id: params.data.id,
          operating_company_id: query.data.operating_company_id,
          invoice_total_cents: invoiceTotal,
          advance_amount_cents: advanceTotal,
          reserve_amount_cents: reserveTotal,
          release_amount_cents: body.data.release_amount_cents,
          factor_fee_cents: body.data.factor_fee_cents,
        },
        "info",
        "P3-T11.20.5-FACTORING"
      );

      return { code: 200 as const, data: await fetchAdvanceDetail(client, params.data.id, query.data.operating_company_id) };
    });

    if ("error" in result) return reply.code(result.code).send({ error: result.error });
    return result.data;
  });

  app.post("/api/v1/accounting/factoring-advances/:id/recourse-return", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (LEGACY_FACTORING_WRITERS_RETIRED) return sendRetiredFactoringWriter(reply, "POST /api/v1/accounting/factoring-advances/:id/recourse-return", BANKING_MATCH_OR_CATEGORIZE);
    // ACCT-F5578: see the create route above for why this reuses the void/cancel executor role set.
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const body = recourseBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    const allowedRecourse = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) =>
      requireVoidCancelExecutorWired(reply, {
        role: String(user.role ?? ""),
        client,
        // no factoring.* permission seeded — role floor until catalog grows
        operatingCompanyId: query.data.operating_company_id,
        userUuid: user.uuid,
      })
    );
    if (!allowedRecourse) return;
    // ROUND 315 OWNER-ONLY LAW: only the Owner creates, closes or matches a purchase (403 + audit row).
    const ownerOkRecourse = await withCompanyScope(user.uuid, query.data.operating_company_id, (client) =>
      requireFactoringPurchaseOwner(reply, client, {
        operatingCompanyId: query.data.operating_company_id,
        userUuid: user.uuid,
        role: String(user.role ?? ""),
        action: "recourse_return",
        targetId: params.data.id,
      })
    );
    if (!ownerOkRecourse) return;

    const result = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const advanceRes = await client.query(`SELECT * FROM accounting.factoring_advances WHERE id = $1 AND operating_company_id = $2::uuid LIMIT 1`, [
        params.data.id,
        query.data.operating_company_id,
      ]);
      const advance = advanceRes.rows[0] ?? null;
      if (!advance) return { code: 404 as const, error: "factoring_advance_not_found" };
      if (["released", "voided"].includes(String(advance.status))) return { code: 409 as const, error: "factoring_status_invalid_transition" };

      const recourseRes = await client.query(
        `
          SELECT BOOL_AND(COALESCE(c.factoring_recourse_type, c2.factoring_recourse_type, 'recourse') = 'recourse') AS all_recourse
          FROM accounting.invoices i
          -- FACT-CUST-DEACT (owner Decision 2, 2026-09-07) — same class as ACCT-F5787: LEFT JOIN + full-row
          -- resolver so a later-deactivated customer never drops its invoice from this recourse test. A
          -- fully unresolved customer COALESCEs to the SAFE 'recourse' default (never silently non-recourse).
          LEFT JOIN mdata.customers c ON c.id = i.customer_id
                                AND c.operating_company_id = i.operating_company_id
          LEFT JOIN LATERAL (
            SELECT * FROM mdata.get_customer_same_company(i.customer_id, i.operating_company_id)
            WHERE c.id IS NULL
          ) c2 ON true
          WHERE i.factoring_advance_id = $1
            AND i.operating_company_id = $2::uuid
        `,
        [params.data.id, query.data.operating_company_id]
      );
      const allRecourse = Boolean(recourceResRow(recourseRes.rows[0]).all_recourse);
      if (!allRecourse) return { code: 409 as const, error: "non_recourse_customer_cannot_recourse_return" };

      const returnedAt = body.data.recourse_returned_at ?? new Date().toISOString();
      await client.query(
        `
          UPDATE accounting.factoring_advances
          SET status = 'recourse_returned',
              recourse_returned_at = $2::timestamptz,
              recourse_reason = $3
          WHERE id = $1
        `,
        [params.data.id, returnedAt, body.data.recourse_reason]
      );
      await client.query(
        `
          UPDATE accounting.invoices
          SET factoring_status = 'recourse_returned',
              updated_at = now(),
              updated_by_user_id = $2
          WHERE factoring_advance_id = $1
        `,
        [params.data.id, user.uuid]
      );

      await appendCrudAudit(
        client,
        user.uuid,
        "accounting.factoring_recourse",
        {
          resource_type: "accounting.factoring_advances",
          resource_id: params.data.id,
          operating_company_id: query.data.operating_company_id,
          recourse_reason: body.data.recourse_reason,
        },
        "warning",
        "P3-T11.20.5-FACTORING"
      );

      return { code: 200 as const, data: await fetchAdvanceDetail(client, params.data.id, query.data.operating_company_id) };
    });

    if ("error" in result) return reply.code(result.code).send({ error: result.error });
    return result.data;
  });

  app.post("/api/v1/accounting/factoring-advances/:id/void", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const body = voidBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);
    // OWNER LAW 2026-10-02 competing-engine audit: a void runs through the ONE purchase engine (voidPurchase: Owner-only,
    // refuses a bank-matched purchase, reverses the funding JE, stamps the void, unlinks the invoices). This route used to
    // reverse on its own with no Owner gate and no bank-match refusal. An advance with no purchase has no live writer left.
    if (LEGACY_FACTORING_WRITERS_RETIRED) {
      const purchase = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) =>
        ((await client.query(
          `SELECT id::text FROM accounting.factoring_purchases
            WHERE factoring_advance_id = $1::uuid AND operating_company_id = $2::uuid AND status = 'posted' LIMIT 1`,
          [params.data.id, query.data.operating_company_id]
        )).rows[0] as { id: string } | undefined) ?? null
      );
      if (!purchase) return sendRetiredFactoringWriter(reply, "POST /api/v1/accounting/factoring-advances/:id/void (advance with no purchase)");
      try {
        return await withCompanyScope(user.uuid, query.data.operating_company_id, (client) =>
          voidPurchase(client, {
            operatingCompanyId: query.data.operating_company_id,
            actorUserId: user.uuid,
            purchaseId: purchase.id,
            reason: body.data.reason ?? "Factoring purchase voided",
          })
        );
      } catch (error) {
        if (error instanceof FactoringPurchaseError) return reply.code(error.statusCode).send({ error: error.code });
        throw error;
      }
    }

    const result = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      // PERMISSION WIRING 10.4: no factoring.* permission seeded — role floor until catalog grows
      if (
        !(await requireVoidCancelExecutorWired(reply, {
          role: String(user.role ?? ""),
          client,
          operatingCompanyId: query.data.operating_company_id,
          userUuid: user.uuid,
        }))
      ) {
        return { code: 403 as const, error: "void_requires_request" };
      }
      const advanceRes = await client.query(`SELECT * FROM accounting.factoring_advances WHERE id = $1 AND operating_company_id = $2::uuid LIMIT 1`, [
        params.data.id,
        query.data.operating_company_id,
      ]);
      const advance = advanceRes.rows[0] ?? null;
      if (!advance) return { code: 404 as const, error: "factoring_advance_not_found" };
      if (!["submitted", "advanced"].includes(String(advance.status))) return { code: 409 as const, error: "factoring_status_invalid_transition" };

      const voidReason = body.data.reason ?? "Factoring advance voided";
      // ACCT-F5980 — reverse any posted funding liability JE BEFORE this connection's own status
      // UPDATE below takes its lock on this row (same lock-order fix ACCT-F5651 already applied to the
      // advance-posting call: reverseFactoringAdvanceEvent opens its OWN connection, same as
      // postFactoringAdvanceEvent). Without this, void flipped the source record while a live,
      // un-reversed liability JE stayed posted in the GL forever — status='voided' but books disagreed.
      const reversal = await reverseFactoringAdvanceEvent({
        operating_company_id: query.data.operating_company_id,
        factoring_advance_id: params.data.id,
        actor_user_id: user.uuid,
        reason: voidReason,
      });

      await client.query(`UPDATE accounting.factoring_advances SET status = 'voided', notes = COALESCE($2, notes) WHERE id = $1`, [
        params.data.id,
        body.data.reason ?? null,
      ]);
      await client.query(
        `
          UPDATE accounting.invoices
          SET factoring_status = 'not_factored',
              factoring_advance_id = NULL,
              updated_at = now(),
              updated_by_user_id = $2
          WHERE factoring_advance_id = $1
        `,
        [params.data.id, user.uuid]
      );
      await appendCrudAudit(
        client,
        user.uuid,
        "accounting.factoring_voided",
        {
          resource_type: "accounting.factoring_advances",
          resource_id: params.data.id,
          operating_company_id: query.data.operating_company_id,
          reason: body.data.reason ?? null,
          gl_reversed: reversal.reversed,
          reversal_journal_entry_id: reversal.reversed ? reversal.reversal_journal_entry_id : null,
        },
        "warning",
        "P3-T11.20.5-FACTORING"
      );
      return {
        code: 200 as const,
        data: {
          ok: true,
          gl_reversed: reversal.reversed,
          reversal_journal_entry_id: reversal.reversed ? reversal.reversal_journal_entry_id : null,
        },
      };
    });

    if ("error" in result) return reply.code(result.code).send({ error: result.error });
    return result.data;
  });
}

function recourceResRow(row: Record<string, unknown> | undefined) {
  return { all_recourse: row?.all_recourse };
}


export default fp(async (app) => {
  await registerFactoringAdvancesRoutes(app);
}, { name: "accounting.registerFactoringAdvancesRoutes" });
