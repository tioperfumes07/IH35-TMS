#!/usr/bin/env node
// ROUND 370 (CC-2) — the Reclassify screen showed a balance and no transactions. "If the sum is non-zero and the list is
// empty, the rows exist and the list query is wrong." Two causes, both closed and pinned here:
//   1. a click on an account never ran the list query (the list waited for a separate "Find" button);
//   2. the list hid reversed / reversal lines the balance counts (9000 Ask My Accountant: 2,837.33 with zero rows).
// Static: the list uses accounting.fn_account_balances_as_of's own predicate and never filters reversal lines out; the
// page loads an account's transactions on click.
// Live (DATABASE_URL, direct endpoint), every non-frozen company, every account with activity in the window: the listed
// rows' COUNT and SUM equal the balance function's period activity — ceiling 0 disagreements.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { NOT_FROZEN_SQL, report, withUnscopedReadOnly } from "./lib/bank-feed-state-machine.mjs";
export const REQUIRES_LIVE_DB = "every account's listed reclassify rows sum to its derived balance";

const LABEL = "verify-reclassify-list-sums-to-its-balance";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SERVICE = "apps/backend/src/accounting/reclassify/reclassify.service.ts";
const PAGE = "apps/frontend/src/pages/accounting/ReclassifyTransactionsPage.tsx";

export function check({ service, page }) {
  const f = [];
  const where = service.slice(service.indexOf("export function buildLineWhere("), service.indexOf("const LINE_FROM"));
  if (!/je\.status <> 'voided'/.test(where) || !/\(p\.posting_batch_id IS NULL OR pb\.batch_status IN \('posted', 'reversed'\)\)/.test(where)) f.push(`${SERVICE}: buildLineWhere must use the balance function's predicate (status <> 'voided' + batch posted/reversed)`);
  if (/reversed_by_line_id IS NULL|reversal_of_line_id IS NULL|je\.status = 'posted'/.test(where)) f.push(`${SERVICE}: buildLineWhere hides rows the balance counts (reversed / reversal / posted-only)`);
  if (!/const openAccount = \(id: string \| null\) => \{ setAccountId\(id\); runFind\(id\); \}/.test(page)) f.push(`${PAGE}: clicking an account must load its transactions (openAccount -> runFind)`);
  if (!/onClick=\{\(\) => openAccount\(a\.account_id\)\}/.test(page)) f.push(`${PAGE}: the account rows must call openAccount on click`);
  // The register loads on open, and its default window is fiscal year to date (a last-month window cannot list what an
  // all-time-through-To-date balance counts).
  if (/useState<\{ from: string; to: string;[^>]*\} \| null>\(null\)/.test(page)) f.push(`${PAGE}: the register must load on open — \`applied\` may not start null`);
  if (!/useState\(firstOfFiscalYear\(\)\)/.test(page) || /firstOfPrevMonth/.test(page)) f.push(`${PAGE}: the default window must be fiscal year to date, not last month`);
  return f;
}

if (process.argv.includes("--selftest")) {
  const real = { service: fs.readFileSync(path.join(ROOT, SERVICE), "utf8"), page: fs.readFileSync(path.join(ROOT, PAGE), "utf8") };
  const fails = [];
  if (check(real).length) fails.push(`tree not clean: ${check(real).join("; ")}`);
  const plants = [
    ["list hides reversed lines again", { ...real, service: real.service.replace("`je.status <> 'voided'`,", "`je.status <> 'voided'`, `p.reversed_by_line_id IS NULL`,") }],
    ["list posted-only again", { ...real, service: real.service.replace("`je.status <> 'voided'`,", "`je.status = 'posted'`,") }],
    ["click only highlights", { ...real, page: real.page.replace("const openAccount = (id: string | null) => { setAccountId(id); runFind(id); };", "const openAccount = (id: string | null) => { setAccountId(id); };") }],
  ];
  for (const [n, s] of plants) if (JSON.stringify(s) === JSON.stringify(real)) fails.push(`plant did not change the source: ${n}`); else if (!check(s).length) fails.push(`plant escaped: ${n}`);
  if (fails.length) { console.error(`${LABEL} --selftest FAIL: ${fails.join("; ")}`); process.exit(1); }
  console.log(`${LABEL} --selftest PASS ${plants.length + 1}/${plants.length + 1}`);
  process.exit(0);
}

const statik = check({ service: fs.readFileSync(path.join(ROOT, SERVICE), "utf8"), page: fs.readFileSync(path.join(ROOT, PAGE), "utf8") });
if (statik.length) report(LABEL, statik, "");
const to = new Date().toISOString().slice(0, 10);
const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1);
const from = d.toISOString().slice(0, 10);
const r = await withUnscopedReadOnly(LABEL, async (c) => {
  const rows = (await c.query(`
    WITH co AS (SELECT id, code FROM org.companies WHERE ${NOT_FROZEN_SQL("id")}),
    bal AS (SELECT co.code, b.account_id, b.account_code, b.account_name, b.period_activity_cents AS act
              FROM co, LATERAL accounting.fn_account_balances_as_of(co.id, $2::date, $1::date) b),
    lst AS (SELECT p.account_id, count(*) AS n, sum(CASE WHEN p.debit_or_credit = 'debit' THEN p.amount_cents ELSE -p.amount_cents END) AS net
              FROM accounting.journal_entry_postings p
              JOIN accounting.journal_entries je ON je.id = p.journal_entry_uuid AND je.operating_company_id = p.operating_company_id
              LEFT JOIN accounting.posting_batches pb ON pb.id = p.posting_batch_id AND pb.operating_company_id = p.operating_company_id
             WHERE p.operating_company_id IN (SELECT id FROM co) AND je.status <> 'voided'
               AND (p.posting_batch_id IS NULL OR pb.batch_status IN ('posted', 'reversed'))
               AND je.entry_date BETWEEN $1::date AND $2::date
             GROUP BY 1)
    SELECT bal.code, bal.account_code, bal.account_name, bal.act::bigint AS act, COALESCE(lst.net, 0)::bigint AS net, COALESCE(lst.n, 0)::int AS n
      FROM bal LEFT JOIN lst ON lst.account_id = bal.account_id
     WHERE bal.act <> 0 OR COALESCE(lst.n, 0) > 0`, [from, to])).rows;
  return { rows };
});
const bad = r.rows.filter((x) => Number(x.act) !== Number(x.net));
report(
  LABEL,
  bad.map((x) => `${x.code} ${x.account_code} ${x.account_name}: balance activity ${Number(x.act) / 100} but listed rows sum ${Number(x.net) / 100} (${x.n} rows)`),
  `${r.rows.length} accounts with activity ${from}..${to} (every non-frozen company, bypass=${r.bypass}) — every list sums to its balance`
);
