// ROUND 326.2 item 1 — FACTORING KPI ENGINE. Every KPI is computed server-side from the LEDGER (journal_entry_postings on
// the factoring role accounts) or from the purchase DOCUMENT (accounting.factoring_purchases / _lines) — never display math
// in a component. Each KPI names its source table and GL account, carries the row count behind it, and drills to exactly
// those rows (getFactoringKpiDrill). A KPI with no data says so and why (empty_reason).
//
// Linkage (LINKAGE LAW §10-B): purchase -> lines -> invoice (A/R) / load / customer / settlement; advance -> funding JE ->
// postings on 1090 / escrow (factor_reserve_held) / cash reserve (factor_cash_reserve_held) / 6400 / 6300 / 2150; matched bank deposit (banking.bank_transactions
// .matched_factoring_advance_id). Reverse path: every drill row carries the ids its screen links to.
// The guard scripts/verify-factoring-banking-kpis-tie-to-ledger.mjs recomputes every value independently and fails on drift.
import { resolveRoleAccountOptional } from "../accounting/coa-roles/resolver.service.js";

type DbClient = { query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }> };

export type KpiRange = { from: string; to: string };

export type FactoringKpi = {
  key: FactoringKpiKey;
  label: string;
  unit: "cents" | "percent" | "days" | "count";
  value: number | null;
  /** Secondary value where the KPI compares two figures (e.g. contracted advance rate). */
  compare_value?: number | null;
  compare_label?: string;
  source: string;
  gl_account: string | null;
  row_count: number;
  empty_reason: string | null;
  buckets?: Array<{ label: string; count: number; cents: number }>;
};

export const FACTORING_KPI_KEYS = [
  "purchased_volume",
  "advance_rate",
  "escrow_reserve_balance",
  "cash_reserve_balance",
  "fees_accrued",
  "default_interest_accrued",
  "net_cash_received",
  "days_to_fund",
  "unfunded_aging",
  "reserve_releases",
] as const;
export type FactoringKpiKey = (typeof FACTORING_KPI_KEYS)[number];

const num = (v: unknown) => (v == null ? 0 : Number(v));

type Accounts = Record<"escrow" | "cash" | "fee" | "interest", { id: string | null; label: string }>;

async function factoringAccounts(client: DbClient, oci: string): Promise<Accounts> {
  const pick = async (role: Parameters<typeof resolveRoleAccountOptional>[2]) => {
    const id = await resolveRoleAccountOptional(client as never, oci, role);
    if (!id) return { id: null, label: `role ${role} (unbound)` };
    const r = await client.query<{ n: string; name: string }>(`SELECT account_number AS n, account_name AS name FROM catalogs.accounts WHERE id = $1::uuid`, [id]);
    return { id, label: `${r.rows[0]?.n ?? "?"} ${r.rows[0]?.name ?? ""}`.trim() };
  };
  return {
    escrow: await pick("factor_reserve_held"),
    cash: await pick("factor_cash_reserve_held"),
    fee: await pick("factor_fee_expense"),
    interest: await pick("default_interest_expense"),
  };
}

// ---- SQL, shared by the KPI value and its drill so the two can never disagree --------------------------------------
const POSTED_IN_RANGE = `p.operating_company_id = $1::uuid AND p.status = 'posted' AND p.purchase_date BETWEEN $2::date AND $3::date`;
const BANK_MATCH = `(SELECT b.id FROM banking.bank_transactions b WHERE b.matched_factoring_advance_id = p.factoring_advance_id AND p.factoring_advance_id IS NOT NULL ORDER BY b.transaction_date LIMIT 1)`;

/** Posted GL lines on one account: balance as of `to` (debit +) or activity inside the range. */
function postingsSql(mode: "balance" | "activity") {
  return `
    FROM accounting.journal_entry_postings jp
    JOIN accounting.journal_entries je ON je.id = jp.journal_entry_uuid AND je.status = 'posted'
   WHERE je.operating_company_id = $1::uuid AND jp.account_id = $4::uuid
     AND ${mode === "balance" ? "$2::date IS NOT NULL AND je.entry_date <= $3::date" : "je.entry_date BETWEEN $2::date AND $3::date"}`;
}
const SIGNED = `CASE WHEN jp.debit_or_credit = 'debit' THEN jp.amount_cents ELSE -jp.amount_cents END`;

/**
 * The book reserve — escrow (factor_reserve_held -> Faro Escrow Reserve) + cash reserve (factor_cash_reserve_held -> Faro Cash Reserve) GL balances
 * as of a date. The ONE reserve figure: the KPI engine, GET /factoring/summary.reserve_balance and the cash-flow
 * overview all read it, so Factoring, Banking and Reports can never show different reserves (ROUND 326.2 item 4).
 */
export async function factoringBookReserveCents(client: DbClient, oci: string, asOf: string) {
  const acc = await factoringAccounts(client, oci);
  const bal = async (id: string | null) =>
    id ? num((await client.query<{ v: string }>(`SELECT COALESCE(sum(${SIGNED}),0)::bigint v ${postingsSql("balance")}`, [oci, asOf, asOf, id])).rows[0]?.v) : 0;
  const escrow = await bal(acc.escrow.id);
  const cash = await bal(acc.cash.id);
  return { escrow, cash, total: escrow + cash };
}

export async function computeFactoringKpis(client: DbClient, oci: string, range: KpiRange): Promise<FactoringKpi[]> {
  const acc = await factoringAccounts(client, oci);
  const base = [oci, range.from, range.to];
  const out: FactoringKpi[] = [];

  const vol = (await client.query<{ n: number; gross: string; adv: string }>(
    `SELECT count(*)::int n, COALESCE(sum(p.gross_cents),0)::bigint gross, COALESCE(sum(p.advance_cents),0)::bigint adv
       FROM accounting.factoring_purchases p WHERE ${POSTED_IN_RANGE}`, base)).rows[0]!;
  const noPurchases = vol.n === 0 ? "No posted factoring purchase in this range — the Owner posts purchases on Submit to Factor." : null;
  out.push({ key: "purchased_volume", label: "Purchased volume", unit: "cents", value: num(vol.gross), source: "accounting.factoring_purchases (posted, gross_cents)",
    gl_account: "2150 Factoring Advance (credit side of each funding JE)", row_count: vol.n, empty_reason: noPurchases });

  const contracted = (await client.query<{ r: string | null }>(
    `SELECT f.advance_rate::text r FROM factoring.canonical_factor_agreements a JOIN factoring.factor f ON f.id = a.factor_profile_id
      WHERE a.tenant_id = $1::uuid AND a.voided_at IS NULL AND f.voided_at IS NULL ORDER BY a.effective_from DESC LIMIT 1`, [oci])).rows[0]?.r;
  out.push({ key: "advance_rate", label: "Advance rate realised", unit: "percent",
    value: num(vol.gross) > 0 ? Number(((num(vol.adv) / num(vol.gross)) * 100).toFixed(2)) : null,
    compare_value: contracted != null ? Number((Number(contracted) * 100).toFixed(2)) : null, compare_label: "Contracted",
    source: "factoring_purchases advance_cents / gross_cents vs factoring.factor.advance_rate", gl_account: null, row_count: vol.n, empty_reason: noPurchases });

  for (const [key, label, a] of [
    ["escrow_reserve_balance", "Escrow reserve balance", acc.escrow],
    ["cash_reserve_balance", "Cash reserve balance", acc.cash],
  ] as const) {
    const r = a.id ? (await client.query<{ n: number; v: string }>(`SELECT count(*)::int n, COALESCE(sum(${SIGNED}),0)::bigint v ${postingsSql("balance")}`, [...base, a.id])).rows[0]! : { n: 0, v: "0" };
    out.push({ key, label, unit: "cents", value: num(r.v), source: "accounting.journal_entry_postings (posted, as of range end)", gl_account: a.label,
      row_count: r.n, empty_reason: !a.id ? `${a.label} — bind the CoA role` : r.n === 0 ? "No posting on this account yet." : null });
  }

  for (const [key, label, a] of [
    ["fees_accrued", "Factoring fees accrued", acc.fee],
    ["default_interest_accrued", "Default interest accrued", acc.interest],
  ] as const) {
    const r = a.id ? (await client.query<{ n: number; v: string }>(`SELECT count(*)::int n, COALESCE(sum(${SIGNED}),0)::bigint v ${postingsSql("activity")}`, [...base, a.id])).rows[0]! : { n: 0, v: "0" };
    out.push({ key, label, unit: "cents", value: num(r.v), source: "accounting.journal_entry_postings (posted, in range)", gl_account: a.label,
      row_count: r.n, empty_reason: !a.id ? `${a.label} — bind the CoA role` : r.n === 0 ? "Nothing accrued in this range." : null });
  }

  const cash = (await client.query<{ n: number; v: string }>(
    `SELECT count(b.id)::int n, COALESCE(sum(b.amount_cents),0)::bigint v
       FROM accounting.factoring_purchases p JOIN banking.bank_transactions b ON b.matched_factoring_advance_id = p.factoring_advance_id
      WHERE ${POSTED_IN_RANGE} AND p.factoring_advance_id IS NOT NULL`, base)).rows[0]!;
  out.push({ key: "net_cash_received", label: "Net cash received", unit: "cents", value: num(cash.v),
    source: "banking.bank_transactions matched to the purchase's advance (matched_factoring_advance_id)", gl_account: "1090 Undeposited Funds -> bank",
    row_count: cash.n, empty_reason: noPurchases ?? (cash.n === 0 ? "No Faro wire matched to a purchase yet — the Owner matches each deposit." : null) });

  const dtf = (await client.query<{ n: number; d: string | null }>(
    `SELECT count(*)::int n, avg(p.purchase_date - i.issue_date)::numeric(10,2)::text d
       FROM accounting.factoring_purchases p JOIN accounting.factoring_purchase_lines l ON l.purchase_id = p.id AND l.voided_at IS NULL
       JOIN accounting.invoices i ON i.id = l.invoice_id
      WHERE ${POSTED_IN_RANGE} AND i.issue_date IS NOT NULL`, base)).rows[0]!;
  out.push({ key: "days_to_fund", label: "Days to fund (invoice issue -> purchase)", unit: "days", value: dtf.d != null ? Number(dtf.d) : null,
    source: "factoring_purchase_lines x accounting.invoices.issue_date", gl_account: null, row_count: dtf.n, empty_reason: noPurchases });

  const aging = (await client.query<{ bucket: string; n: number; v: string }>(
    `SELECT CASE WHEN ($3::date - p.purchase_date) <= 7 THEN '0-7' WHEN ($3::date - p.purchase_date) <= 15 THEN '8-15'
                 WHEN ($3::date - p.purchase_date) <= 30 THEN '16-30' ELSE '31+' END bucket,
            count(*)::int n, COALESCE(sum(p.net_to_company_cents),0)::bigint v
       FROM accounting.factoring_purchases p WHERE ${POSTED_IN_RANGE} AND ${BANK_MATCH} IS NULL GROUP BY 1`, base)).rows;
  const agingN = aging.reduce((a, b) => a + b.n, 0);
  out.push({ key: "unfunded_aging", label: "Unfunded purchases (no matched wire)", unit: "cents", value: aging.reduce((a, b) => a + num(b.v), 0),
    source: "posted factoring_purchases with no matched bank deposit, by days since purchase", gl_account: "1090 Undeposited Funds", row_count: agingN,
    buckets: ["0-7", "8-15", "16-30", "31+"].map((b) => { const x = aging.find((y) => y.bucket === b); return { label: b, count: x?.n ?? 0, cents: num(x?.v) }; }),
    empty_reason: noPurchases ?? (agingN === 0 ? "Every posted purchase has its wire matched." : null) });

  const rel = acc.escrow.id ? (await client.query<{ n: number; v: string }>(
    `SELECT count(*)::int n, COALESCE(sum(jp.amount_cents),0)::bigint v ${postingsSql("activity")}
       AND jp.debit_or_credit = 'credit' AND jp.source_transaction_type = 'factoring_reserve_release'`, [...base, acc.escrow.id])).rows[0]! : { n: 0, v: "0" };
  out.push({ key: "reserve_releases", label: "Reserve releases", unit: "cents", value: num(rel.v),
    source: "credits to the escrow reserve account sourced factoring_reserve_release", gl_account: acc.escrow.label, row_count: rel.n,
    empty_reason: rel.n === 0 ? "Faro has released no reserve in this range." : null });

  return out;
}

/** The rows behind one KPI — the same predicates the KPI used, with the ids each row links to. */
export async function getFactoringKpiDrill(client: DbClient, oci: string, key: FactoringKpiKey, range: KpiRange) {
  const base = [oci, range.from, range.to];
  const acc = await factoringAccounts(client, oci);
  switch (key) {
    case "purchased_volume":
    case "advance_rate":
      return (await client.query(
        `SELECT p.id AS purchase_id, p.display_id, p.purchase_date, p.invoice_count, p.gross_cents, p.advance_cents, p.escrow_reserve_cents,
                p.cash_reserve_cents, p.fee_cents, p.net_to_company_cents, p.factoring_advance_id, p.journal_entry_id, ${BANK_MATCH} AS bank_transaction_id
           FROM accounting.factoring_purchases p WHERE ${POSTED_IN_RANGE} ORDER BY p.purchase_date, p.display_id`, base)).rows;
    case "escrow_reserve_balance":
    case "cash_reserve_balance":
    case "fees_accrued":
    case "default_interest_accrued":
    case "reserve_releases": {
      const a = key === "escrow_reserve_balance" || key === "reserve_releases" ? acc.escrow : key === "cash_reserve_balance" ? acc.cash : key === "fees_accrued" ? acc.fee : acc.interest;
      if (!a.id) return [];
      const mode = key.endsWith("_balance") ? "balance" : "activity";
      const extra = key === "reserve_releases" ? `AND jp.debit_or_credit = 'credit' AND jp.source_transaction_type = 'factoring_reserve_release'` : "";
      return (await client.query(
        `SELECT jp.id AS posting_id, je.id AS journal_entry_id, je.entry_date, left(je.memo, 120) AS memo, jp.debit_or_credit, jp.amount_cents,
                ${SIGNED} AS signed_cents, jp.source_transaction_type, jp.source_transaction_id
           ${postingsSql(mode)} ${extra} ORDER BY je.entry_date, je.id`, [...base, a.id])).rows;
    }
    case "net_cash_received":
      return (await client.query(
        `SELECT b.id AS bank_transaction_id, b.transaction_date, b.amount_cents, p.id AS purchase_id, p.display_id, p.net_to_company_cents
           FROM accounting.factoring_purchases p JOIN banking.bank_transactions b ON b.matched_factoring_advance_id = p.factoring_advance_id
          WHERE ${POSTED_IN_RANGE} AND p.factoring_advance_id IS NOT NULL ORDER BY b.transaction_date`, base)).rows;
    case "days_to_fund":
      return (await client.query(
        `SELECT p.id AS purchase_id, p.display_id, p.purchase_date, i.id AS invoice_id, i.display_id AS invoice_display_id, i.issue_date,
                (p.purchase_date - i.issue_date) AS days, l.load_id, l.customer_id
           FROM accounting.factoring_purchases p JOIN accounting.factoring_purchase_lines l ON l.purchase_id = p.id AND l.voided_at IS NULL
           JOIN accounting.invoices i ON i.id = l.invoice_id
          WHERE ${POSTED_IN_RANGE} AND i.issue_date IS NOT NULL ORDER BY p.purchase_date, i.display_id`, base)).rows;
    case "unfunded_aging":
      return (await client.query(
        `SELECT p.id AS purchase_id, p.display_id, p.purchase_date, ($3::date - p.purchase_date) AS days_unfunded, p.net_to_company_cents
           FROM accounting.factoring_purchases p WHERE ${POSTED_IN_RANGE} AND ${BANK_MATCH} IS NULL ORDER BY p.purchase_date`, base)).rows;
  }
}
