#!/usr/bin/env node
// Owner ruling 2026-10-02 — the Faro escrow and cash reserve accounts hold what the factor deducts from loads and what is
// paid out of them; 1230 "Factoring Reserves" has nothing to do with them. Each factoring reserve ROLE must therefore be
// bound to the same GL account as its Faro bank account, or posting (role) and the bank register (ledger_account_id) read
// different accounts and never agree:
//   factor_reserve_held      (escrow deduction) == GL of bank account "Faro Escrow Reserve"
//   factor_cash_reserve_held (cash reserve)     == GL of bank account "Faro Cash Reserve"
// Reads chart-of-accounts configuration only (roles + bank-account bindings), never balances. Live-only: fails closed
// without DATABASE_URL. --selftest proves the comparison catches a mismatch, an unbound role and a missing bank account.
import pg from "pg";

const LABEL = "verify-factor-reserve-roles-match-faro-bank-accounts";
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const PAIRS = [
  { role: "factor_reserve_held", bank: "Faro Escrow Reserve" },
  { role: "factor_cash_reserve_held", bank: "Faro Cash Reserve" },
];

export function compare(rows) {
  const problems = [];
  for (const { role, bank } of PAIRS) {
    const r = rows.find((x) => x.role === role);
    const b = rows.find((x) => x.bank === bank);
    if (!b) { problems.push(`no active bank account "${bank}"`); continue; }
    if (!r || !r.role_account) { problems.push(`role ${role} is unbound (bank account "${bank}" is on ${b.bank_account_number})`); continue; }
    if (r.role_account !== b.bank_account) {
      problems.push(`role ${role} -> ${r.role_account_number} but bank account "${bank}" -> ${b.bank_account_number}`);
    }
  }
  return problems;
}

if (process.argv.includes("--selftest")) {
  const ok = [
    { role: "factor_reserve_held", role_account: "a1236", role_account_number: "1236" },
    { role: "factor_cash_reserve_held", role_account: "a1235", role_account_number: "1235" },
    { bank: "Faro Escrow Reserve", bank_account: "a1236", bank_account_number: "1236" },
    { bank: "Faro Cash Reserve", bank_account: "a1235", bank_account_number: "1235" },
  ];
  const mismatch = ok.map((x) => (x.role === "factor_reserve_held" ? { ...x, role_account: "a1230", role_account_number: "1230" } : x));
  const unbound = ok.filter((x) => x.role !== "factor_cash_reserve_held");
  const noBank = ok.filter((x) => x.bank !== "Faro Escrow Reserve");
  const cases = [
    [compare(ok).length === 0, "matching bindings pass"],
    [compare(mismatch).length === 1, "escrow role on 1230 fails"],
    [compare(unbound).length === 1, "unbound cash role fails"],
    [compare(noBank).length === 1, "missing escrow bank account fails"],
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
let rows = [];
try {
  await c.query("BEGIN READ ONLY");
  await c.query("SET LOCAL app.bypass_rls = 'lucia'");
  const roles = await c.query(
    `SELECT r.role, r.account_id::text AS role_account, a.account_number AS role_account_number
       FROM accounting.chart_of_accounts_roles r JOIN catalogs.accounts a ON a.id = r.account_id
      WHERE r.operating_company_id = $1::uuid AND r.role = ANY($2::text[])`,
    [USMCA, PAIRS.map((p) => p.role)]
  );
  const banks = await c.query(
    `SELECT b.account_name AS bank, b.ledger_account_id::text AS bank_account, a.account_number AS bank_account_number
       FROM banking.bank_accounts b LEFT JOIN catalogs.accounts a ON a.id = b.ledger_account_id
      WHERE b.operating_company_id = $1::uuid AND b.is_active AND b.account_name = ANY($2::text[])`,
    [USMCA, PAIRS.map((p) => p.bank)]
  );
  rows = [...roles.rows, ...banks.rows];
  await c.query("ROLLBACK");
} finally {
  await c.end();
}

const problems = compare(rows);
if (problems.length) { console.error(`${LABEL}: FAIL — ${problems.join("; ")}`); process.exit(1); }
console.log(`${LABEL}: PASS — escrow and cash reserve roles are bound to their Faro bank accounts' GL accounts`);
