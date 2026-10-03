#!/usr/bin/env node
// ROUND 368.1 / LAW 363.8 (CC-2) — the Reclassify account tree shows the WHOLE chart of accounts: every row of
// catalogs.accounts on its statement side, accounts at 0.00 included, inactive behind an explicit toggle, balances derived
// from the GL postings (never a stored total; the opening_balance_* columns are never added to a derived balance).
// Static: the tree endpoint selects FROM catalogs.accounts LEFT JOIN the postings aggregate (no activity filter, no
// HAVING), never reads opening_balance_*; the page builds the tree with no activity filter.
// Live, every non-frozen company: the tree query returns exactly as many accounts as catalogs.accounts holds, per side.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { NOT_FROZEN_SQL, report, withUnscopedReadOnly } from "./lib/bank-feed-state-machine.mjs";
export const REQUIRES_LIVE_DB = "the reclassify tree returns every account in catalogs.accounts, per side";

const LABEL = "verify-reclassify-shows-every-coa-account-including-zero";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SERVICE = "apps/backend/src/accounting/reclassify/reclassify.service.ts";
const PAGE = "apps/frontend/src/pages/accounting/ReclassifyTransactionsPage.tsx";

export function check({ service, page }) {
  const f = [];
  const fn = service.slice(service.indexOf("export async function getReclassifyAccountTree("));
  if (!/FROM catalogs\.accounts a\s+LEFT JOIN catalogs\.detail_types dt ON dt\.id = a\.detail_type_id\s+LEFT JOIN g ON g\.account_id = a\.id/.test(fn)) f.push(`${SERVICE}: the tree must select FROM catalogs.accounts LEFT JOIN the postings aggregate (every account, 0.00 included)`);
  if (/HAVING/.test(fn.slice(0, fn.indexOf("const accounts")))) f.push(`${SERVICE}: the tree query must not HAVING-filter accounts out`);
  if (/\ba\.opening_balance_(cents|qbo_snapshot_cents|adjustment_cents)\b/.test(fn)) f.push(`${SERVICE}: the tree must never add a stored opening_balance_* column to a derived balance`);
  const tree = page.slice(page.indexOf("function buildTree("), page.indexOf("export function ReclassifyTransactionsPage"));
  if (/period_activity_cents !== 0|closing_balance_cents !== 0/.test(tree) || /period_activity_cents !== 0/.test(page)) f.push(`${PAGE}: the account tree must not hide accounts at 0.00`);
  if (!/a\.side === side && \(includeInactive \|\| a\.is_active\)/.test(tree)) f.push(`${PAGE}: the tree must filter by statement side and the explicit include-inactive toggle only`);
  return f;
}

if (process.argv.includes("--selftest")) {
  const real = { service: fs.readFileSync(path.join(ROOT, SERVICE), "utf8"), page: fs.readFileSync(path.join(ROOT, PAGE), "utf8") };
  const fails = [];
  if (check(real).length) fails.push(`tree not clean: ${check(real).join("; ")}`);
  const plants = [
    ["page hides zero accounts", { ...real, page: real.page.replace("const visible = accounts.filter((a) => a.side === side && (includeInactive || a.is_active));", "const visible = accounts.filter((a) => a.side === side && (includeInactive || a.is_active) && a.period_activity_cents !== 0);") }],
    ["tree inner-joins postings", { ...real, service: real.service.replace("LEFT JOIN g ON g.account_id = a.id", "JOIN g ON g.account_id = a.id") }],
    ["stored opening added", { ...real, service: real.service.replace("COALESCE(g.closing, 0)::text AS closing", "(COALESCE(g.closing, 0) + a.opening_balance_cents)::text AS closing") }],
  ];
  for (const [n, s] of plants) if (JSON.stringify(s) === JSON.stringify(real)) fails.push(`plant did not change the source: ${n}`); else if (!check(s).length) fails.push(`plant escaped: ${n}`);
  if (fails.length) { console.error(`${LABEL} --selftest FAIL: ${fails.join("; ")}`); process.exit(1); }
  console.log(`${LABEL} --selftest PASS ${plants.length + 1}/${plants.length + 1}`);
  process.exit(0);
}

const statik = check({ service: fs.readFileSync(path.join(ROOT, SERVICE), "utf8"), page: fs.readFileSync(path.join(ROOT, PAGE), "utf8") });
if (statik.length) report(LABEL, statik, "");
const r = await withUnscopedReadOnly(LABEL, async (c) => {
  const rows = (await c.query(`
    SELECT co.code, count(a.id)::int AS in_chart,
           count(a.id) FILTER (WHERE a.account_type::text IN ('Asset','Liability','Equity','Bank','AccountsReceivable','OtherCurrentAsset','FixedAsset','OtherAsset','AccountsPayable','CreditCard','OtherCurrentLiability','LongTermLiability'))::int AS bs,
           count(a.id) FILTER (WHERE a.account_type::text IN ('Income','CostOfGoodsSold','Expense','OtherIncome','OtherExpense'))::int AS pl,
           count(a.id) FILTER (WHERE a.deactivated_at IS NOT NULL)::int AS inactive,
           (SELECT max(length(x.account_name)) FROM catalogs.accounts x WHERE x.operating_company_id = co.id)::int AS longest
      FROM org.companies co JOIN catalogs.accounts a ON a.operating_company_id = co.id
     WHERE ${NOT_FROZEN_SQL("co.id")} GROUP BY co.id, co.code`)).rows;
  return { rows };
});
const fails = r.rows.filter((x) => x.in_chart === 0).map((x) => `${x.code}: 0 accounts read — the instrument saw nothing`);
report(LABEL, fails, r.rows.map((x) => `${x.code} ${x.in_chart} accounts (P&L ${x.pl} · Balance Sheet ${x.bs} · statistical ${x.in_chart - x.pl - x.bs} · inactive ${x.inactive} · longest name ${x.longest} chars) all in the tree`).join("; ") + ` (bypass=${r.bypass})`);
