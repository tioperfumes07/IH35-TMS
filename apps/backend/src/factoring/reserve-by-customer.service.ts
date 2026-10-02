// Lead ROUND 296 §3 / owner "they are not cards" — the per-customer Faro reserve, a ROW PER CUSTOMER, computed by ONE query
// that also proves itself: the column total ties to the GL balance of the Faro reserve accounts (1230 Escrow report +
// 1235 Cash report) to the cent.
//
//   held      = the reserve Faro held at purchase on that customer's purchased invoices — escrow + cash reserve on each
//               posted purchase line (the purchase document is stamped per invoice; its funding entry posts the same total)
//   released  = reserve movements stamped to those invoices that paid reserve out (release, transfer to our bank)
//   fees      = Schedule Fees and customer short-pays charged to the reserve, stamped to the invoice
//   recourse  = reserve applied to a repurchase of that invoice
//   reserve_now = held + released + fees + recourse   (the last three are negative when money left the reserve)
//
// A reserve movement that is not stamped to an invoice (a Faro reserve deposit or a pool payout) cannot belong to a
// customer, so it is its own row — "Not stamped to an invoice" — never dropped and never spread: the column total stays
// the GL balance. THE STAMP IS THE FIX: the reserve posters stamp entity_type = 'invoice', entity_uuid = invoice id on every
// reserve leg they write, with the source types below.
import { factoringReserveAccountIds } from "./factoring-kpi.service.js";

type DbClient = { query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }> };

/** Source types the Faro reserve posters stamp on their reserve legs — the classification this report reads. */
export const FARO_RESERVE_SOURCE = {
  release: "faro_reserve_release",
  escrowToCash: "faro_escrow_to_cash",
  scheduleFee: "faro_schedule_fee",
  shortPay: "faro_short_pay",
  repurchase: "factoring_repurchase",
  deposit: "faro_reserve_deposit",
  clientPayable: "faro_client_payable",
} as const;

export type ReserveByCustomerRow = {
  customer_id: string | null;
  customer_name: string;
  invoices_purchased: number;
  face_cents: number;
  advanced_cents: number;
  held_cents: number;
  released_cents: number;
  fees_cents: number;
  recourse_cents: number;
  reserve_now_cents: number;
};

const n = (v: unknown) => (v == null ? 0 : Number(v));

/** One SQL, shared by the per-customer table, its per-invoice drill and the tie-out guard. */
function reserveSql(level: "customer" | "invoice") {
  const key = level === "customer" ? "customer_id" : "invoice_id";
  return `
  WITH lines AS (
    SELECT l.invoice_id, l.customer_id, l.gross_cents,
           (l.gross_cents - l.escrow_reserve_cents - l.cash_reserve_cents - l.fee_cents) AS advanced_cents,
           (l.escrow_reserve_cents + l.cash_reserve_cents) AS held_cents
      FROM accounting.factoring_purchase_lines l
      JOIN accounting.factoring_purchases p ON p.id = l.purchase_id
     WHERE p.operating_company_id = $1::uuid AND p.status = 'posted' AND l.voided_at IS NULL AND p.purchase_date <= $2::date
  ),
  moves AS (
    SELECT CASE WHEN jp.entity_type = 'invoice' THEN jp.entity_uuid END AS invoice_id,
           CASE WHEN jp.debit_or_credit = 'debit' THEN jp.amount_cents ELSE -jp.amount_cents END AS signed,
           jp.source_transaction_type AS src
      FROM accounting.journal_entry_postings jp
      JOIN accounting.journal_entries je ON je.id = jp.journal_entry_uuid AND je.status = 'posted'
     WHERE je.operating_company_id = $1::uuid AND jp.account_id = ANY($3::uuid[]) AND je.entry_date <= $2::date
       AND jp.source_transaction_type IS DISTINCT FROM 'factoring_advance'
  ),
  inv AS (
    SELECT COALESCE(li.invoice_id, mv.invoice_id) AS invoice_id,
           COALESCE(li.customer_id, i.customer_id) AS customer_id,
           COALESCE(li.n, 0) AS invoices_purchased, COALESCE(li.face, 0) AS face_cents, COALESCE(li.adv, 0) AS advanced_cents,
           COALESCE(li.held, 0) AS held_cents,
           COALESCE(mv.released, 0) AS released_cents, COALESCE(mv.fees, 0) AS fees_cents, COALESCE(mv.recourse, 0) AS recourse_cents,
           COALESCE(mv.other, 0) AS other_cents
      FROM (SELECT invoice_id, min(customer_id::text)::uuid AS customer_id, count(*)::int AS n, sum(gross_cents) AS face,
                   sum(advanced_cents) AS adv, sum(held_cents) AS held FROM lines GROUP BY invoice_id) li
      FULL JOIN (SELECT invoice_id,
                   sum(signed) FILTER (WHERE src IN ('${FARO_RESERVE_SOURCE.release}')) AS released,
                   sum(signed) FILTER (WHERE src IN ('${FARO_RESERVE_SOURCE.scheduleFee}', '${FARO_RESERVE_SOURCE.shortPay}')) AS fees,
                   sum(signed) FILTER (WHERE src IN ('${FARO_RESERVE_SOURCE.repurchase}')) AS recourse,
                   sum(signed) FILTER (WHERE src IS NULL OR src NOT IN ('${FARO_RESERVE_SOURCE.release}', '${FARO_RESERVE_SOURCE.scheduleFee}',
                                       '${FARO_RESERVE_SOURCE.shortPay}', '${FARO_RESERVE_SOURCE.repurchase}')) AS other
                   FROM moves GROUP BY invoice_id) mv ON mv.invoice_id = li.invoice_id
      LEFT JOIN accounting.invoices i ON i.id = COALESCE(li.invoice_id, mv.invoice_id)
  )
  SELECT ${level === "customer" ? "inv.customer_id" : "inv.invoice_id, inv.customer_id, i2.display_id AS invoice_display_id"},
         ${level === "customer" ? "COALESCE(c.customer_name, CASE WHEN inv.customer_id IS NULL AND bool_and(inv.invoice_id IS NULL) THEN 'Not stamped to an invoice' ELSE '—' END)" : "COALESCE(c.customer_name, '—')"} AS customer_name,
         sum(inv.invoices_purchased)::int AS invoices_purchased, sum(inv.face_cents)::bigint AS face_cents,
         sum(inv.advanced_cents)::bigint AS advanced_cents, sum(inv.held_cents)::bigint AS held_cents,
         sum(inv.released_cents)::bigint AS released_cents, sum(inv.fees_cents)::bigint AS fees_cents,
         sum(inv.recourse_cents)::bigint AS recourse_cents,
         sum(inv.held_cents + inv.released_cents + inv.fees_cents + inv.recourse_cents + inv.other_cents)::bigint AS reserve_now_cents
    FROM inv
    LEFT JOIN mdata.customers c ON c.id = inv.customer_id
    ${level === "invoice" ? "LEFT JOIN accounting.invoices i2 ON i2.id = inv.invoice_id" : ""}
   ${level === "invoice" ? "WHERE ($4::uuid IS NULL OR inv.customer_id = $4::uuid)" : ""}
   GROUP BY ${level === "customer" ? "inv.customer_id, c.customer_name" : `inv.${key}, inv.customer_id, c.customer_name, i2.display_id`}
   ORDER BY reserve_now_cents DESC NULLS LAST`;
}

/** GL balance of the Faro reserve accounts (escrow + cash report registers), as of a date — what the table must tie to. */
async function reserveGlBalanceCents(client: DbClient, oci: string, asOf: string, ids: string[]) {
  if (!ids.length) return 0;
  return n((await client.query<{ v: string }>(
    `SELECT COALESCE(sum(CASE WHEN jp.debit_or_credit = 'debit' THEN jp.amount_cents ELSE -jp.amount_cents END), 0)::bigint AS v
       FROM accounting.journal_entry_postings jp
       JOIN accounting.journal_entries je ON je.id = jp.journal_entry_uuid AND je.status = 'posted'
      WHERE je.operating_company_id = $1::uuid AND jp.account_id = ANY($3::uuid[]) AND je.entry_date <= $2::date`,
    [oci, asOf, ids])).rows[0]?.v);
}

export async function reserveByCustomer(client: DbClient, oci: string, asOf: string) {
  const ids = await factoringReserveAccountIds(client, oci);
  const rows = ids.length ? (await client.query<Record<string, unknown>>(reserveSql("customer"), [oci, asOf, ids])).rows : [];
  const out: ReserveByCustomerRow[] = rows.map((r) => ({
    customer_id: (r.customer_id as string | null) ?? null,
    customer_name: String(r.customer_name ?? "—"),
    invoices_purchased: n(r.invoices_purchased),
    face_cents: n(r.face_cents),
    advanced_cents: n(r.advanced_cents),
    held_cents: n(r.held_cents),
    released_cents: n(r.released_cents),
    fees_cents: n(r.fees_cents),
    recourse_cents: n(r.recourse_cents),
    reserve_now_cents: n(r.reserve_now_cents),
  }));
  const total = out.reduce((s, r) => s + r.reserve_now_cents, 0);
  const gl = await reserveGlBalanceCents(client, oci, asOf, ids);
  return {
    as_of: asOf,
    rows: out,
    total_reserve_now_cents: total,
    gl_balance_cents: gl,
    ties_to_gl: total === gl,
    empty_reason: !ids.length
      ? "The Faro reserve roles are unbound — bind factor_reserve_held (1230) and factor_cash_reserve_held (1235)."
      : out.length === 0
        ? "No purchased invoice and no reserve movement yet — the reserve fills when the Owner posts purchases."
        : null,
  };
}

/** The per-invoice drill under one customer (or all), from the same SQL. */
export async function reserveByInvoice(client: DbClient, oci: string, asOf: string, customerId: string | null) {
  const ids = await factoringReserveAccountIds(client, oci);
  if (!ids.length) return [];
  return (await client.query<Record<string, unknown>>(reserveSql("invoice"), [oci, asOf, ids, customerId])).rows;
}
