// ROUND 326.2 item 2 — BANKING KPI ENGINE. Every KPI is computed server-side from the bank feed
// (banking.bank_transactions), the GL (journal_entry_postings on each bank account's ledger_account_id) or the factoring
// purchase document — never display math in a component. Each KPI names its source, carries the row count behind it and
// drills to exactly those rows (getBankingKpiDrill); the value and the drill share one predicate so they cannot disagree.
//
// Resolved / unmatched follows the canonical review_state (CHECK: for_review | categorized | excluded | matched | transfer):
// matched / categorized / transfer = resolved, for_review = unmatched, excluded = out of scope. Direction is is_credit and
// amounts are absolute (amount_cents sign is not consistent across feeds).
//
// Linkage (LINKAGE LAW §10-B): bank line -> bank account -> ledger account; matched_* -> invoice / bill / settlement / fuel
// transaction / Relay fill / factoring advance / journal entry; reconciliation_session_id -> session. Every drill row carries
// the ids its screen links to. Guard: scripts/verify-factoring-banking-kpis-tie-to-ledger.mjs recomputes every value.

type DbClient = { query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }> };

export type BankingKpiRange = { from: string; to: string };

export const BANKING_KPI_KEYS = [
  "cash_position",
  "cleared_vs_uncleared",
  "unmatched_inflow",
  "unmatched_outflow",
  "match_rate",
  "reconciliation_gap",
  "factoring_wires_vs_expected",
  "fuel_drafts",
  "settlement_drafts",
  "escrow_held",
  "escrow_contributions",
  "escrow_deductions",
] as const;
export type BankingKpiKey = (typeof BANKING_KPI_KEYS)[number];

export type BankingKpi = {
  key: BankingKpiKey;
  label: string;
  /** Headline on the tile. Not a drill-row column — those use drill_label. */
  primary_label?: string;
  unit: "cents" | "percent" | "count";
  value: number | null;
  compare_value?: number | null;
  compare_label?: string;
  source: string;
  gl_account: string | null;
  row_count: number;
  empty_reason: string | null;
  buckets?: Array<{ label: string; count: number; cents: number }>;
};

const num = (v: unknown) => (v == null ? 0 : Number(v));

// ---- SQL, shared by each KPI value and its drill --------------------------------------------------------------------
/** A real, live bank line in range: not voided, not merged into another line, not sample data. */
const LIVE = `b.operating_company_id = $1::uuid AND b.voided_at IS NULL AND b.merged_into_bank_transaction_id IS NULL
  AND NOT COALESCE(b.is_sample_data, false) AND b.transaction_date BETWEEN $2::date AND $3::date`;
const IN_SCOPE = `${LIVE} AND b.review_state IS DISTINCT FROM 'excluded'`;
const RESOLVED = `b.review_state IN ('matched', 'categorized', 'transfer')`;
const UNMATCHED = `b.review_state = 'for_review'`;
const ABS = `abs(b.amount_cents)`;
const FUEL = `(b.matched_fuel_transaction_id IS NOT NULL OR b.matched_relay_fuel_transaction_id IS NOT NULL)`;
const LINE_COLS = `b.id AS bank_transaction_id, COALESCE(left(b.description, 80), b.id::text) AS drill_label, b.transaction_date, b.bank_account_id, COALESCE(ba.display_name, ba.account_name) AS bank_account,
  left(b.description, 120) AS description, b.is_credit, ${ABS} AS amount_cents, b.review_state, b.reconciliation_cleared, b.pending,
  b.matched_invoice_id AS invoice_id, b.matched_bill_id AS bill_id, b.matched_settlement_id AS settlement_id,
  b.matched_factoring_advance_id AS factoring_advance_id, b.matched_journal_entry_id AS journal_entry_id, b.matched_load_id AS load_id`;
const LINES_FROM = `FROM banking.bank_transactions b JOIN banking.bank_accounts ba ON ba.id = b.bank_account_id`;

/** Each active, visible bank account with a GL link, and the GL account's type (Asset accounts make up cash). */
const ACCOUNTS = `SELECT ba.id AS bank_account_id, COALESCE(ba.display_name, ba.account_name) AS bank_account, ba.ledger_account_id,
         ca.account_number, ca.account_type, ba.plaid_account_id IS NOT NULL AS has_feed, ba.current_balance_cents
    FROM banking.bank_accounts ba JOIN catalogs.accounts ca ON ca.id = ba.ledger_account_id
   WHERE ba.operating_company_id = $1::uuid AND ba.is_active AND ba.hidden_at IS NULL`;
/** GL book balance per account (debit +) from posted entries dated on or before `to`. */
const BOOK_BALANCE = `(SELECT COALESCE(sum(CASE WHEN jp.debit_or_credit = 'debit' THEN jp.amount_cents ELSE -jp.amount_cents END), 0)::bigint
    FROM accounting.journal_entry_postings jp JOIN accounting.journal_entries je ON je.id = jp.journal_entry_uuid AND je.status = 'posted'
   WHERE je.operating_company_id = $1::uuid AND jp.account_id = a.ledger_account_id AND $2::date IS NOT NULL AND je.entry_date <= $3::date)`;
/** One row per Asset bank account per day with GL activity in range: the day's net and the running book balance. */
const CASH_DAYS = `
  WITH a AS (${ACCOUNTS} AND ca.account_type = 'Asset'),
  d AS (
    SELECT a.bank_account_id, a.bank_account, a.bank_account AS drill_label, a.account_number, je.entry_date,
           sum(CASE WHEN jp.debit_or_credit = 'debit' THEN jp.amount_cents ELSE -jp.amount_cents END)::bigint AS day_net_cents
      FROM a JOIN accounting.journal_entry_postings jp ON jp.account_id = a.ledger_account_id
      JOIN accounting.journal_entries je ON je.id = jp.journal_entry_uuid AND je.status = 'posted' AND je.operating_company_id = $1::uuid
     WHERE je.entry_date <= $3::date
     GROUP BY 1, 2, 3, 4, 5)
  SELECT * FROM (
    SELECT d.*, sum(d.day_net_cents) OVER (PARTITION BY d.bank_account_id ORDER BY d.entry_date)::bigint AS balance_cents FROM d) x
   WHERE x.entry_date BETWEEN $2::date AND $3::date`;
/** Bank-feed balance vs GL book balance, per account with a live feed. */
const RECON_GAP = `
  SELECT a.bank_account_id, a.bank_account, a.bank_account AS drill_label, a.account_number, a.current_balance_cents AS bank_balance_cents, ${BOOK_BALANCE} AS book_balance_cents,
         (a.current_balance_cents - ${BOOK_BALANCE})::bigint AS gap_cents,
         (SELECT s.id FROM banking.reconciliation_sessions s WHERE s.bank_account_id = a.bank_account_id AND s.voided_at IS NULL
           ORDER BY s.period_end DESC LIMIT 1) AS reconciliation_session_id
    FROM (${ACCOUNTS} AND ba.plaid_account_id IS NOT NULL) a`;
/** Each posted factoring purchase in range: the net Faro owes the bank vs what was matched to it. */
const WIRES = `
  SELECT p.id AS purchase_id, p.display_id, p.display_id AS drill_label, p.purchase_date, p.factoring_advance_id, p.net_to_company_cents AS expected_cents,
         COALESCE(w.received, 0)::bigint AS received_cents, (COALESCE(w.received, 0) - p.net_to_company_cents)::bigint AS variance_cents,
         w.bank_transaction_id
    FROM accounting.factoring_purchases p
    LEFT JOIN LATERAL (SELECT sum(abs(b.amount_cents)) AS received, min(b.id::text)::uuid AS bank_transaction_id
                         FROM banking.bank_transactions b
                        WHERE p.factoring_advance_id IS NOT NULL AND b.matched_factoring_advance_id = p.factoring_advance_id
                          AND b.voided_at IS NULL AND b.merged_into_bank_transaction_id IS NULL) w ON true
   WHERE p.operating_company_id = $1::uuid AND p.status = 'posted' AND p.purchase_date BETWEEN $2::date AND $3::date`;

/**
 * ROUND 335 item 2 (approved preview, Banking Feature 2 — Driver Escrow visualizer): driver escrow is the GL liability bound
 * to role escrow_liability_default (2100 Driver Escrow - Held in Trust) and every account under it (2100-00, the per-driver
 * 2100-00-0xx sub-accounts), walked by parent_account_id. Held = credit - debit as of range end (a liability reads
 * positive); contributions = credits in range; deductions / releases = debits in range. Value and drill share this SQL.
 */
const ESCROW_TREE = `
  WITH RECURSIVE root AS (
    SELECT r.account_id AS id FROM accounting.chart_of_accounts_roles r
     WHERE r.operating_company_id = $1::uuid AND r.role = 'escrow_liability_default' AND r.is_active),
  tree AS (SELECT id FROM root UNION SELECT a.id FROM catalogs.accounts a JOIN tree t ON a.parent_account_id = t.id)`;
const escrowPostings = (when: "balance" | "activity", side: "credit" | "debit" | null) => `${ESCROW_TREE}
  SELECT je.id AS journal_entry_id, je.entry_date, ca.account_number, ca.account_name, ca.account_name AS drill_label, p.debit_or_credit, p.amount_cents,
         p.source_transaction_type, p.source_transaction_id, left(je.memo, 120) AS memo
    FROM tree JOIN accounting.journal_entry_postings p ON p.account_id = tree.id
    JOIN accounting.journal_entries je ON je.id = p.journal_entry_uuid AND je.status = 'posted' AND je.operating_company_id = $1::uuid
    JOIN catalogs.accounts ca ON ca.id = p.account_id
   WHERE ${when === "balance" ? "$2::date IS NOT NULL AND je.entry_date <= $3::date" : "je.entry_date BETWEEN $2::date AND $3::date"}
     ${side ? `AND p.debit_or_credit = '${side}'` : ""}`;

export async function computeBankingKpis(client: DbClient, oci: string, range: BankingKpiRange): Promise<BankingKpi[]> {
  const base = [oci, range.from, range.to];
  const out: BankingKpi[] = [];

  const cash = (await client.query<{ bank_account: string; account_number: string; balance: string }>(
    `SELECT a.bank_account, a.account_number, ${BOOK_BALANCE} AS balance FROM (${ACCOUNTS} AND ca.account_type = 'Asset') a ORDER BY a.account_number`, base)).rows;
  const cashDays = num((await client.query<{ n: number }>(`SELECT count(*)::int AS n FROM (${CASH_DAYS}) c`, base)).rows[0]?.n);
  out.push({ key: "cash_position", label: "Cash position (book)", unit: "cents", value: cash.reduce((s, r) => s + num(r.balance), 0),
    source: "Posted general-ledger balance of each bank account as of the end date (detail: per account, per day)",
    gl_account: cash.map((r) => r.account_number).join(", ") || null, row_count: cashDays,
    buckets: cash.map((r) => ({ label: `${r.bank_account} (${r.account_number})`, count: 0, cents: num(r.balance) })),
    empty_reason: cash.length === 0 ? "No active bank account is linked to a GL cash account — link it on Cash / GL setup." : cashDays === 0 ? "No posted cash activity in this range." : null });

  const clr = (await client.query<{ n: number; un: number; cn: number; uv: string; cv: string; uin: string; uout: string; uin_n: number; uout_n: number }>(
    `SELECT count(*)::int AS n,
            count(*) FILTER (WHERE b.reconciliation_cleared IS NOT TRUE)::int AS un,
            count(*) FILTER (WHERE b.reconciliation_cleared IS TRUE)::int AS cn,
            COALESCE(sum(CASE WHEN b.is_credit THEN ${ABS} ELSE -${ABS} END) FILTER (WHERE b.reconciliation_cleared IS NOT TRUE), 0)::bigint AS uv,
            COALESCE(sum(CASE WHEN b.is_credit THEN ${ABS} ELSE -${ABS} END) FILTER (WHERE b.reconciliation_cleared IS TRUE), 0)::bigint AS cv,
            COALESCE(sum(${ABS}) FILTER (WHERE b.reconciliation_cleared IS NOT TRUE AND b.is_credit), 0)::bigint AS uin,
            COALESCE(sum(${ABS}) FILTER (WHERE b.reconciliation_cleared IS NOT TRUE AND NOT b.is_credit), 0)::bigint AS uout,
            count(*) FILTER (WHERE b.reconciliation_cleared IS NOT TRUE AND b.is_credit)::int AS uin_n,
            count(*) FILTER (WHERE b.reconciliation_cleared IS NOT TRUE AND NOT b.is_credit)::int AS uout_n
       FROM banking.bank_transactions b WHERE ${IN_SCOPE}`, base)).rows[0]!;
  const noLines = clr.n === 0 ? "No bank line in this range." : null;
  out.push({ key: "cleared_vs_uncleared", label: "Uncleared", primary_label: "Uncleared", unit: "cents",
    value: num(clr.uin), compare_value: num(clr.uout), compare_label: "Out",
    source: "Uncleared deposits-in and payments-out as two quantities. Net and cleared live in the breakdown — never a single signed-net headline.",
    gl_account: null, row_count: clr.un,
    buckets: [
      { label: "In", count: clr.uin_n, cents: num(clr.uin) },
      { label: "Out", count: clr.uout_n, cents: num(clr.uout) },
      { label: "Net", count: clr.un, cents: num(clr.uv) },
      { label: "Cleared", count: clr.cn, cents: num(clr.cv) },
    ], empty_reason: noLines });

  for (const [key, label, dir] of [["unmatched_inflow", "Unmatched inflow", true], ["unmatched_outflow", "Unmatched outflow", false]] as const) {
    const r = (await client.query<{ n: number; v: string }>(
      `SELECT count(*)::int AS n, COALESCE(sum(${ABS}), 0)::bigint AS v FROM banking.bank_transactions b WHERE ${IN_SCOPE} AND ${UNMATCHED} AND b.is_credit = ${dir}`, base)).rows[0]!;
    out.push({ key, label, unit: "cents", value: num(r.v), source: "Bank lines still in For Review", gl_account: null, row_count: r.n,
      empty_reason: noLines ?? (r.n === 0 ? `Every ${dir ? "deposit" : "payment"} in this range is matched or categorized.` : null) });
  }

  const mr = (await client.query<{ n: number; m: number }>(
    `SELECT count(*)::int AS n, count(*) FILTER (WHERE ${RESOLVED})::int AS m FROM banking.bank_transactions b WHERE ${IN_SCOPE}`, base)).rows[0]!;
  out.push({ key: "match_rate", label: "Match rate", unit: "percent", value: mr.n > 0 ? Number(((mr.m / mr.n) * 100).toFixed(2)) : null,
    compare_value: mr.m, compare_label: "Resolved lines", source: "Bank lines matched, categorized or recorded as transfers, out of all lines (excluded left out)",
    gl_account: null, row_count: mr.n, empty_reason: noLines });

  const gap = (await client.query<{ bank_account: string; gap_cents: string }>(RECON_GAP, base)).rows;
  out.push({ key: "reconciliation_gap", label: "Reconciliation gap (feed vs book)", unit: "cents", value: gap.reduce((s, r) => s + Math.abs(num(r.gap_cents)), 0),
    source: "Bank-feed balance minus general-ledger balance, per connected account, as of the end date", gl_account: null,
    row_count: gap.length, buckets: gap.map((r) => ({ label: r.bank_account, count: 1, cents: num(r.gap_cents) })),
    empty_reason: gap.length === 0 ? "No bank account with a live feed is linked to a GL account." : null });

  const w = (await client.query<{ n: number; e: string; r: string }>(
    `SELECT count(*)::int AS n, COALESCE(sum(expected_cents), 0)::bigint AS e, COALESCE(sum(received_cents), 0)::bigint AS r FROM (${WIRES}) w`, base)).rows[0]!;
  out.push({ key: "factoring_wires_vs_expected", label: "Factoring wires vs expected", unit: "cents", value: num(w.r), compare_value: num(w.e), compare_label: "Expected",
    source: "Faro wires matched to purchases, shown beside the net each posted purchase was due", gl_account: "1090 Undeposited Funds", row_count: w.n,
    empty_reason: w.n === 0 ? "No posted factoring purchase in this range — the Owner posts purchases on Submit to Factor." : null });

  for (const [key, label, pred, why] of [
    ["fuel_drafts", "Fuel drafts", FUEL, "No bank payment matched to a fuel or Relay transaction in this range."],
    ["settlement_drafts", "Settlement drafts", `b.matched_settlement_id IS NOT NULL`, "No bank payment matched to a driver settlement in this range."],
  ] as const) {
    const r = (await client.query<{ n: number; v: string }>(
      `SELECT count(*)::int AS n, COALESCE(sum(${ABS}), 0)::bigint AS v FROM banking.bank_transactions b WHERE ${IN_SCOPE} AND b.is_credit = false AND ${pred}`, base)).rows[0]!;
    out.push({ key, label, unit: "cents", value: num(r.v), source: key === "fuel_drafts" ? "Bank payments matched to fuel or Relay fuel purchases" : "Bank payments matched to driver settlements", gl_account: null, row_count: r.n,
      empty_reason: r.n === 0 ? why : null });
  }

  const root = (await client.query<{ n: number; label: string | null }>(
    `${ESCROW_TREE} SELECT (SELECT count(*)::int FROM root) AS n,
       (SELECT ca.account_number || ' ' || ca.account_name FROM root JOIN catalogs.accounts ca ON ca.id = root.id LIMIT 1) AS label`, [oci])).rows[0]!;
  const unbound = root.n === 0 ? "Driver Escrow is not bound to a GL account — bind it on Cash / GL setup." : null;
  const glLabel = root.label ? `${root.label} (+ sub-accounts)` : null;
  const held = (await client.query<{ n: number; v: string }>(
    `SELECT count(*)::int AS n, COALESCE(sum(CASE WHEN e.debit_or_credit = 'credit' THEN e.amount_cents ELSE -e.amount_cents END), 0)::bigint AS v
       FROM (${escrowPostings("balance", null)}) e`, base)).rows[0]!;
  const perAcct = (await client.query<{ label: string; v: string }>(
    `SELECT e.account_number || ' ' || e.account_name AS label,
            sum(CASE WHEN e.debit_or_credit = 'credit' THEN e.amount_cents ELSE -e.amount_cents END)::bigint AS v
       FROM (${escrowPostings("balance", null)}) e GROUP BY 1 HAVING sum(CASE WHEN e.debit_or_credit = 'credit' THEN e.amount_cents ELSE -e.amount_cents END) <> 0
      ORDER BY 1`, base)).rows;
  out.push({ key: "escrow_held", label: "Driver escrow held", unit: "cents", value: num(held.v),
    compare_value: perAcct.length, compare_label: "Accounts holding escrow",
    source: "Posted balance of Driver Escrow and its per-driver sub-accounts as of the end date",
    gl_account: glLabel, row_count: held.n, buckets: perAcct.map((r) => ({ label: r.label, count: 1, cents: num(r.v) })),
    empty_reason: unbound ?? (held.n === 0 ? "No escrow posting on or before this date." : null) });
  for (const [key, label, side, why] of [
    ["escrow_contributions", "Escrow contributions", "credit", "No escrow contribution in this range."],
    ["escrow_deductions", "Escrow deductions / releases", "debit", "No escrow deduction or release in this range."],
  ] as const) {
    const r = (await client.query<{ n: number; v: string }>(
      `SELECT count(*)::int AS n, COALESCE(sum(e.amount_cents), 0)::bigint AS v FROM (${escrowPostings("activity", side)}) e`, base)).rows[0]!;
    out.push({ key, label, unit: "cents", value: num(r.v), source: side === "credit" ? "Escrow contributions posted in the date range" : "Escrow deductions and releases posted in the date range",
      gl_account: glLabel, row_count: r.n, empty_reason: unbound ?? (r.n === 0 ? why : null) });
  }
  return out;
}

/** The rows behind one KPI — the same predicate the KPI used, with the ids each row links to. */
export async function getBankingKpiDrill(client: DbClient, oci: string, key: BankingKpiKey, range: BankingKpiRange) {
  const base = [oci, range.from, range.to];
  const lines = async (extra: string) =>
    (await client.query(`SELECT ${LINE_COLS} ${LINES_FROM} WHERE ${IN_SCOPE} ${extra} ORDER BY b.transaction_date, b.id`, base)).rows;
  switch (key) {
    case "cash_position":
      return (await client.query(`${CASH_DAYS} ORDER BY account_number, entry_date`, base)).rows;
    case "cleared_vs_uncleared":
      return lines(`AND b.reconciliation_cleared IS NOT TRUE`);
    case "match_rate":
      return lines("");
    case "unmatched_inflow":
      return lines(`AND ${UNMATCHED} AND b.is_credit = true`);
    case "unmatched_outflow":
      return lines(`AND ${UNMATCHED} AND b.is_credit = false`);
    case "reconciliation_gap":
      return (await client.query(`${RECON_GAP} ORDER BY a.account_number`, base)).rows;
    case "factoring_wires_vs_expected":
      return (await client.query(`${WIRES} ORDER BY p.purchase_date, p.display_id`, base)).rows;
    case "fuel_drafts":
      return (await client.query(
        `SELECT ${LINE_COLS}, b.matched_fuel_transaction_id AS fuel_transaction_id, b.matched_relay_fuel_transaction_id AS relay_fuel_transaction_id
           ${LINES_FROM} WHERE ${IN_SCOPE} AND b.is_credit = false AND ${FUEL} ORDER BY b.transaction_date, b.id`, base)).rows;
    case "settlement_drafts":
      return lines(`AND b.is_credit = false AND b.matched_settlement_id IS NOT NULL`);
    case "escrow_held":
      return (await client.query(`${escrowPostings("balance", null)} ORDER BY je.entry_date, ca.account_number, je.id`, base)).rows;
    case "escrow_contributions":
      return (await client.query(`${escrowPostings("activity", "credit")} ORDER BY je.entry_date, ca.account_number, je.id`, base)).rows;
    case "escrow_deductions":
      return (await client.query(`${escrowPostings("activity", "debit")} ORDER BY je.entry_date, ca.account_number, je.id`, base)).rows;
  }
}
