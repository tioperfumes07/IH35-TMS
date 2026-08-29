/**
 * DISPATCH-B — Unified Transaction Register.
 * GET /api/v1/accounting/transaction-register
 *
 * One read-only, entity-scoped list across every operational money event:
 * bank transactions, fuel purchases, invoices (AR), bills (AP) and driver
 * settlements. READ ONLY — no posting, no GL writes, no money mutation.
 *
 * Every source is scoped by operating_company_id (TRANSP in this tenant) both
 * via RLS (withCompanyScope sets app.operating_company_id) AND an explicit
 * predicate in each UNION arm — never cross-entity.
 *
 * Money is normalized to integer CENTS:
 *   - bank.amount_cents / invoice.total_cents / bill.amount_cents are already cents.
 *   - fuel.total_cost and settlement.net_pay are numeric DOLLARS -> *100 (no 10x bug).
 */
import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { z } from "zod";
import { companyQuerySchema, currentAuthUser, validationError, withCompanyScope } from "./shared.js";

const SOURCES = ["bank", "fuel", "invoice", "bill", "settlement"] as const;

const querySchema = companyQuerySchema.extend({
  source: z
    .union([z.enum(SOURCES), z.array(z.enum(SOURCES))])
    .optional()
    .transform((v) => (v === undefined ? undefined : Array.isArray(v) ? v : [v])),
  status: z
    .union([z.string().trim().min(1).max(40), z.array(z.string().trim().min(1).max(40))])
    .optional()
    .transform((v) => (v === undefined ? undefined : Array.isArray(v) ? v : [v])),
  direction: z.enum(["in", "out", "all"]).optional().default("all"),
  date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  q: z.string().trim().max(120).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

type RegisterRow = {
  source: string;
  id: string;
  txn_date: string | null;
  description: string | null;
  counterparty: string | null;
  type: string;
  amount_in_cents: string;
  amount_out_cents: string;
  status: string | null;
  detail_path: string | null;
  journal_entry_id: string | null;
  journal_entry_memo: string | null;
  total_count: string;
};

// The unified UNION ALL. $1 = operating_company_id (reused by every arm).
// Columns verified against db/migrations: banking.bank_transactions (0073),
// fuel.fuel_transactions (0300), accounting.invoices (0060), accounting.bills
// (0090), driver_finance.driver_settlements (0124).
export const TRANSACTION_REGISTER_UNION_SQL = `
  SELECT 'bank' AS source, bt.id::text AS id, bt.transaction_date AS txn_date,
         COALESCE(NULLIF(bt.description, ''), bt.merchant_name, 'Bank transaction') AS description,
         bt.merchant_name AS counterparty,
         'Bank' AS type,
         (CASE WHEN bt.is_credit THEN ABS(bt.amount_cents) ELSE 0 END)::bigint AS amount_in_cents,
         (CASE WHEN bt.is_credit THEN 0 ELSE ABS(bt.amount_cents) END)::bigint AS amount_out_cents,
         COALESCE(bt.status, 'uncategorized') AS status,
         '/banking/transactions?txn_id=' || bt.id::text AS detail_path,
         -- ACCT-F5982: real column on banking.bank_transactions, no join needed. 3029 doesn't apply
         -- here (this arm never joins accounting.journal_entries), but the memo column must still be
         -- present to keep every UNION ALL arm's column list aligned.
         bt.matched_journal_entry_id::text AS journal_entry_id,
         NULL::text AS journal_entry_memo
    FROM banking.bank_transactions bt
   WHERE bt.operating_company_id = $1::uuid

  UNION ALL

  SELECT 'fuel' AS source, ft.id::text AS id, ft.purchased_at::date AS txn_date,
         COALESCE('Fuel' || CASE WHEN NULLIF(ft.location_city, '') IS NOT NULL
                                 THEN ' — ' || ft.location_city ELSE '' END, 'Fuel purchase') AS description,
         -- LST-TXNREG-DEACTIVATED-COUNTERPARTY — mdata.vendors' own RLS policy excludes
         -- deactivated_at IS NOT NULL rows for a non-bypass reader, so a plain v.vendor_name goes
         -- NULL (renders "—", unsearchable) the moment a cited vendor is later deactivated. The FK
         -- is still valid; only the vendor's selectable-for-new-work status changed. Same fix class
         -- already shipped for invoices.routes.ts (ACCT-F5611); mdata.resolve_vendor_label_same_company
         -- (202612780000) is the canonical, already-proven, same-company-scoped resolver.
         COALESCE(v.vendor_name, mdata.resolve_vendor_label_same_company(ft.vendor_id, ft.operating_company_id)) AS counterparty,
         'Fuel' AS type,
         0::bigint AS amount_in_cents,
         ROUND(COALESCE(ft.total_cost, 0) * 100)::bigint AS amount_out_cents,
         (CASE WHEN ft.qbo_expense_id IS NOT NULL THEN 'synced' ELSE 'recorded' END) AS status,
         '/fuel/history?transaction_id=' || ft.id::text AS detail_path,
         -- ACCT-F5982: a raw fuel purchase has no journal_entry_postings source_transaction_type of
         -- its own (fuel flows through 'bill'/'expense' once categorized) — honest NULL, not a gap.
         NULL::text AS journal_entry_id,
         NULL::text AS journal_entry_memo
    FROM fuel.fuel_transactions ft
    LEFT JOIN mdata.vendors v ON v.id = ft.vendor_id
                             AND v.operating_company_id = ft.operating_company_id
   WHERE ft.operating_company_id = $1::uuid AND ft.archived_at IS NULL

  UNION ALL

  SELECT 'invoice' AS source, i.id::text AS id, i.issue_date AS txn_date,
         COALESCE(i.display_id, 'Invoice') AS description,
         -- LST-TXNREG-DEACTIVATED-COUNTERPARTY — same class, customer side; mirrors
         -- mdata.resolve_customer_label_same_company's own already-proven use in invoices.routes.ts
         -- (ACCT-F5611).
         COALESCE(c.customer_name, mdata.resolve_customer_label_same_company(i.customer_id, i.operating_company_id)) AS counterparty,
         'Invoice (AR)' AS type,
         COALESCE(i.total_cents, 0)::bigint AS amount_in_cents,
         0::bigint AS amount_out_cents,
         i.status,
         '/accounting/invoices/' || i.id::text AS detail_path,
         -- ACCT-F5982: same source_transaction_type='invoice' resolution invoices.routes.ts already
         -- uses for its own GL panel (Law §9) — most recent posting for this invoice, if any (an
         -- unsent draft invoice correctly resolves NULL, not an invented link).
         jei.journal_entry_id,
         -- 3029 (LV-JE-LABEL-IGNORES-POPULATED-MEMO): accounting.journal_entries has no number/ref
         -- column, so je.memo IS the JE's human identity — a payload that exposes je.id without it
         -- renders the honest-but-uninformative "Journal entry - not visible" fallback forever.
         jei.journal_entry_memo
    FROM accounting.invoices i
    LEFT JOIN mdata.customers c ON c.id = i.customer_id
                               AND c.operating_company_id = i.operating_company_id
    LEFT JOIN LATERAL (
      SELECT je.id::text AS journal_entry_id, je.memo AS journal_entry_memo
        FROM accounting.journal_entry_postings jep
        JOIN accounting.journal_entries je ON je.id = jep.journal_entry_uuid
                                           AND je.operating_company_id = jep.operating_company_id
       WHERE jep.operating_company_id = i.operating_company_id
         AND jep.source_transaction_type = 'invoice'
         AND jep.source_transaction_id = i.id::text
       ORDER BY je.entry_date DESC, je.created_at DESC
       LIMIT 1
    ) jei ON true
   WHERE i.operating_company_id = $1::uuid

  UNION ALL

  SELECT 'bill' AS source, b.id::text AS id, b.bill_date AS txn_date,
         COALESCE(NULLIF(b.bill_number, ''), b.display_id, 'Bill') AS description,
         -- LST-TXNREG-DEACTIVATED-COUNTERPARTY — same class, vendor side (bill_uuid is TEXT; the
         -- same safe-cast used by the join predicate below feeds the resolver, never a raw ::uuid cast).
         COALESCE(
           v.vendor_name,
           mdata.resolve_vendor_label_same_company(
             CASE WHEN b.vendor_uuid ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
               THEN b.vendor_uuid::uuid ELSE NULL END,
             b.operating_company_id
           )
         ) AS counterparty,
         'Bill (AP)' AS type,
         0::bigint AS amount_in_cents,
         COALESCE(b.amount_cents, ROUND(COALESCE(b.total_amount, 0) * 100)::bigint, 0)::bigint AS amount_out_cents,
         b.status,
         '/accounting/bills/' || b.id::text AS detail_path,
         -- ACCT-F5982: same source_transaction_type='bill' resolution the bill GL poster itself
         -- claims against (bill-gl.service.ts) — most recent posting for this bill, if any.
         jeb.journal_entry_id,
         -- 3029: see the invoice arm's identical comment above.
         jeb.journal_entry_memo
    FROM accounting.bills b
    LEFT JOIN mdata.vendors v ON v.id::text = b.vendor_uuid
                             AND v.operating_company_id = b.operating_company_id
    LEFT JOIN LATERAL (
      SELECT je.id::text AS journal_entry_id, je.memo AS journal_entry_memo
        FROM accounting.journal_entry_postings jep
        JOIN accounting.journal_entries je ON je.id = jep.journal_entry_uuid
                                           AND je.operating_company_id = jep.operating_company_id
       WHERE jep.operating_company_id = b.operating_company_id
         AND jep.source_transaction_type = 'bill'
         AND jep.source_transaction_id = b.id::text
       ORDER BY je.entry_date DESC, je.created_at DESC
       LIMIT 1
    ) jeb ON true
   WHERE b.operating_company_id = $1::uuid AND b.revoked_at IS NULL

  UNION ALL

  -- LST-TXNREG-DEACTIVATED-COUNTERPARTY — the driver arm needs NO resolver: mdata.drivers'
  -- drivers_select RLS policy (unlike customers/vendors) does not exclude deactivated_at IS NOT
  -- NULL rows at all, so a deactivated driver's name still resolves here for a normal
  -- non-bypass session. Live-verified as ih35_app/Owner on USMCA: 10 of 10 settlements resolve a
  -- driver name, including 2 tied to a deactivated driver. Stated explicitly so this isn't
  -- re-investigated as a false negative later.
  SELECT 'settlement' AS source, s.id::text AS id, s.period_end AS txn_date,
         COALESCE(s.display_id, 'Settlement')
           || CASE WHEN TRIM(CONCAT_WS(' ', d.first_name, d.last_name)) <> ''
                   THEN ' — ' || CONCAT_WS(' ', d.first_name, d.last_name) ELSE '' END AS description,
         NULLIF(TRIM(CONCAT_WS(' ', d.first_name, d.last_name)), '') AS counterparty,
         'Settlement' AS type,
         0::bigint AS amount_in_cents,
         ROUND(COALESCE(s.net_pay, 0) * 100)::bigint AS amount_out_cents,
         s.status,
         '/driver-finance/settlements?settlement_id=' || s.id::text AS detail_path,
         -- ACCT-F5982: a settlement header has no single journal_entry_postings
         -- source_transaction_type of its own — its lines post per deduction/advance/reimbursement
         -- type (driver_advance, driver_reimbursement, etc), never one JE per settlement. Honest
         -- NULL rather than an invented one-to-one link that doesn't exist.
         NULL::text AS journal_entry_id,
         NULL::text AS journal_entry_memo
    FROM driver_finance.driver_settlements s
    LEFT JOIN mdata.drivers d ON d.id = s.driver_id
                              AND d.operating_company_id = s.operating_company_id
   WHERE s.operating_company_id = $1::uuid
`;

export async function registerTransactionRegisterRoutes(app: FastifyInstance) {
  app.get("/api/v1/accounting/transaction-register", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;

    const parsed = querySchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);
    const q = parsed.data;

    return withCompanyScope(user.uuid, q.operating_company_id, async (client) => {
      const where: string[] = [];
      const values: unknown[] = [q.operating_company_id];

      if (q.source && q.source.length > 0) {
        values.push(q.source);
        where.push(`source = ANY($${values.length}::text[])`);
      }
      if (q.status && q.status.length > 0) {
        values.push(q.status);
        where.push(`status = ANY($${values.length}::text[])`);
      }
      if (q.date_from) {
        values.push(q.date_from);
        where.push(`txn_date >= $${values.length}::date`);
      }
      if (q.date_to) {
        values.push(q.date_to);
        where.push(`txn_date <= $${values.length}::date`);
      }
      if (q.direction === "in") where.push(`amount_in_cents > 0`);
      if (q.direction === "out") where.push(`amount_out_cents > 0`);
      if (q.q) {
        values.push(`%${q.q}%`);
        where.push(`(description ILIKE $${values.length} OR counterparty ILIKE $${values.length})`);
      }

      const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
      values.push(q.limit);
      const limitIdx = values.length;
      values.push(q.offset);
      const offsetIdx = values.length;

      const sql = `
        WITH reg AS (${TRANSACTION_REGISTER_UNION_SQL})
        SELECT source, id, txn_date::text AS txn_date, description, counterparty, type,
               amount_in_cents::text AS amount_in_cents, amount_out_cents::text AS amount_out_cents,
               status, detail_path, journal_entry_id, journal_entry_memo,
               count(*) OVER()::text AS total_count
          FROM reg
          ${whereSql}
         ORDER BY txn_date DESC NULLS LAST, source ASC, id ASC
         LIMIT $${limitIdx} OFFSET $${offsetIdx}
      `;

      const res = await client.query(sql, values);
      const rows = res.rows as RegisterRow[];
      const total = rows.length > 0 ? Number(rows[0].total_count) : 0;

      return {
        rows: rows.map((r: RegisterRow) => ({
          source: r.source,
          id: r.id,
          date: r.txn_date,
          description: r.description,
          counterparty: r.counterparty,
          type: r.type,
          amount_in_cents: Number(r.amount_in_cents),
          amount_out_cents: Number(r.amount_out_cents),
          status: r.status,
          detail_path: r.detail_path,
          journal_entry_id: r.journal_entry_id,
          journal_entry_memo: r.journal_entry_memo,
        })),
        total,
        limit: q.limit,
        offset: q.offset,
      };
    });
  });
}

export default fp(async (app) => {
  await registerTransactionRegisterRoutes(app);
}, { name: "accounting.registerTransactionRegisterRoutes" });
