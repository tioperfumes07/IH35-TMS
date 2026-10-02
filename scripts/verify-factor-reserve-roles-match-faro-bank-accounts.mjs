#!/usr/bin/env node
// Lead ROUND 296 FINAL (owner-relayed 2026-10-02), migrations 202615220800 + 202615230600: the Faro reserve is two
// registers, one per Faro report — 1230 Factoring Reserves = Faro's ESCROW report (restricted, per invoice; role
// factor_reserve_held) and 1235 Faro Cash Reserve = Faro's CASH report (on deposit, releasable; role
// factor_cash_reserve_held). Each role must resolve to its account, and each Faro register (bank account) must be active on
// that same account — so posting (role) and the Banking register read the same GL. 1236 (duplicate) stays retired. Also:
// accrued default interest has its own liability role (factor_default_interest_payable, 2155) and Transaction Fees their own
// role (factor_transaction_fee).
// Reads chart-of-accounts configuration only, never balances. Live-only: fails closed without DATABASE_URL.
import pg from "pg";

const LABEL = "verify-factor-reserve-roles-match-faro-bank-accounts";
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";

const PAIRS = [
  { role: "factor_reserve_held", account: "1230", bank: "Faro Escrow Reserve" },
  { role: "factor_cash_reserve_held", account: "1235", bank: "Faro Cash Reserve" },
];

export function compare({ roles, banks }) {
  const problems = [];
  const r = (role) => roles.find((x) => x.role === role);
  for (const p of PAIRS) {
    const role = r(p.role);
    if (!role) { problems.push(`role ${p.role} is unbound`); continue; }
    if (role.account_number !== p.account) problems.push(`role ${p.role} -> ${role.account_number}; Faro's ${p.bank.replace("Faro ", "")} report is ${p.account}`);
    const bank = banks.find((b) => b.account_name === p.bank);
    if (!bank) problems.push(`no "${p.bank}" register`);
    else if (!bank.is_active) problems.push(`the "${p.bank}" register is inactive`);
    else if (bank.ledger_account_id !== role.account_id) problems.push(`the "${p.bank}" register sits on ${bank.account_number}, not ${role.account_number}`);
  }
  for (const role of ["factor_default_interest_payable", "factor_transaction_fee"]) if (!r(role)) problems.push(`role ${role} is unbound`);
  return problems;
}

if (process.argv.includes("--selftest")) {
  const ok = {
    roles: [
      { role: "factor_reserve_held", account_id: "a1230", account_number: "1230" },
      { role: "factor_cash_reserve_held", account_id: "a1235", account_number: "1235" },
      { role: "factor_default_interest_payable", account_id: "a2155", account_number: "2155" },
      { role: "factor_transaction_fee", account_id: "a6405", account_number: "6405" },
    ],
    banks: [
      { account_name: "Faro Escrow Reserve", ledger_account_id: "a1230", account_number: "1230", is_active: true },
      { account_name: "Faro Cash Reserve", ledger_account_id: "a1235", account_number: "1235", is_active: true },
    ],
  };
  const setRole = (role, id, n) => ({ ...ok, roles: ok.roles.map((x) => (x.role === role ? { ...x, account_id: id, account_number: n } : x)) });
  const cases = [
    [compare(ok).length === 0, "two registers pass"],
    [compare(setRole("factor_reserve_held", "a1236", "1236")).length > 0, "escrow role on 1236 fails"],
    [compare(setRole("factor_cash_reserve_held", "a1230", "1230")).length > 0, "cash merged into 1230 fails"],
    [compare({ ...ok, banks: ok.banks.map((b) => (b.account_name === "Faro Cash Reserve" ? { ...b, is_active: false } : b)) }).length > 0, "inactive cash register fails"],
    [compare({ ...ok, roles: ok.roles.filter((x) => x.role !== "factor_default_interest_payable") }).length > 0, "missing 2155 role fails"],
  ];
  const bad = cases.filter(([pass]) => !pass).map(([, n]) => n);
  if (bad.length) { console.error(`${LABEL} --selftest FAIL: ${bad.join("; ")}`); process.exit(1); }
  console.log(`${LABEL} --selftest PASS ${cases.length}/${cases.length}`);
  process.exit(0);
}

const url = process.env.DATABASE_URL;
if (!url) { console.error(`${LABEL}: FAIL — DATABASE_URL not set (live guard fails closed).`); process.exit(1); }
const c = new pg.Client({ connectionString: url, statement_timeout: 30000 });
await c.connect();
let roles = [], banks = [];
try {
  await c.query("BEGIN READ ONLY");
  await c.query("SET LOCAL app.bypass_rls = 'lucia'");
  roles = (await c.query(
    `SELECT r.role, r.account_id::text, a.account_number FROM accounting.chart_of_accounts_roles r JOIN catalogs.accounts a ON a.id = r.account_id
      WHERE r.operating_company_id = $1::uuid AND r.role = ANY($2::text[])`,
    [USMCA, ["factor_reserve_held", "factor_cash_reserve_held", "factor_default_interest_payable", "factor_transaction_fee"]])).rows;
  banks = (await c.query(
    `SELECT b.account_name, b.ledger_account_id::text, a.account_number, b.is_active
       FROM banking.bank_accounts b LEFT JOIN catalogs.accounts a ON a.id = b.ledger_account_id
      WHERE b.operating_company_id = $1::uuid AND b.account_name IN ('Faro Escrow Reserve', 'Faro Cash Reserve')`, [USMCA])).rows;
  await c.query("ROLLBACK");
} finally {
  await c.end();
}
const problems = compare({ roles, banks });
if (problems.length) { console.error(`${LABEL}: FAIL — ${problems.join("; ")}`); process.exit(1); }
console.log(`${LABEL}: PASS — Faro Escrow report = 1230 and Cash report = 1235: each role and its active register on the same account; 2155 interest payable and transaction-fee roles bound`);
