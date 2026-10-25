#!/usr/bin/env node
// MDP-FIX-2 guard: Manual Daily Projections field structure + summed totals.
// ROUND 443.280-A #11 — board labels Party/Payee · Doc / load · Due · Amount (CashFlow-Manual);
// underlying keys stay party_name + invoice_no (ref_label/category behind "+ more").
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const fail = (m) => { console.error(`FAIL verify-mdp-fields: ${m}`); process.exit(1); };
const tab = readFileSync(join(root, "apps/frontend/src/pages/cash-flow/tabs/ManualDailyProjectionsTab.tsx"), "utf8");

// 443.280 board columns — income Party + Doc / load; expense Payee + Doc / load.
if (!/income:\s*\[\s*\{\s*key:\s*"party_name",\s*label:\s*"Party"[\s\S]*?\{\s*key:\s*"invoice_no",\s*label:\s*"Doc \/ load"/.test(tab)) {
  fail("income must have board columns: Party(party_name) -> Doc / load(invoice_no)");
}
if (!/expense:\s*\[\s*\{\s*key:\s*"party_name",\s*label:\s*"Payee"[\s\S]*?\{\s*key:\s*"invoice_no",\s*label:\s*"Doc \/ load"/.test(tab)) {
  fail("expense must have board columns: Payee(party_name) -> Doc / load(invoice_no)");
}
if (/"Invoice customer"/.test(tab)) fail("income must NOT use the merged 'Invoice customer' field");

// Due + Amount board columns (Due = projection/entry date display; Amount = Total MoneyInput).
if (!/>Due</.test(tab) && !/"Due"/.test(tab)) fail("board Due column missing");
if (!/"Amount"/.test(tab) && !/>Amount</.test(tab)) fail("board Amount column missing");

// Both panels sum a Total (footer) — defect 1; totals flow from parent computeProjectionTotals via panelTotalCents.
if (!/data-mdp-footer-total=\{direction\}/.test(tab)) fail("each panel must render a summed Total footer (data-mdp-footer-total)");
if (!/panelTotalCents=\{totalIncome\}/.test(tab) || !/panelTotalCents=\{totalExpense\}/.test(tab)) {
  fail("panels must receive panelTotalCents from computeProjectionTotals (shared with KPI row)");
}
if (!/data-mdp-header-total=\{direction\}[\s\S]{0,60}panelTotalCents/.test(tab)) {
  fail("panel header total must display panelTotalCents (same source as KPI + footer)");
}

// Net + KPI totals use computeProjectionTotals (income/expense/net all recompute).
if (!/computeProjectionTotals\(entries\)/.test(tab)) fail("tab must compute income/expense/net via computeProjectionTotals");

// 443.280 — Opening-cash editor must not sit on the board body (Filters only).
if (/title="Opening cash & banks"/.test(tab)) {
  fail("443.280 forbids Opening cash & banks editor on the Manual board body — move under Filters");
}

function mdpSilentMutationErrors(src) {
  const problems = [];
  const delIdx = src.indexOf("const deleteMutation = useMutation");
  const delBlock = delIdx === -1 ? "" : src.slice(delIdx, delIdx + 350);
  if (delIdx === -1 || !/onError\s*:/.test(delBlock)) {
    problems.push("deleteMutation has no onError — Del fail is a silent no-op");
  }
  const openIdx = src.indexOf("const openingMutation = useMutation");
  const openBlock = openIdx === -1 ? "" : src.slice(openIdx, openIdx + 450);
  if (openIdx === -1 || !/onError\s*:/.test(openBlock) || !/data-testid="cash-flow-opening-error"/.test(src)) {
    problems.push("openingMutation has no onError + visible opening-error — Save opening cash fail is a silent no-op");
  }
  return problems;
}

if (process.argv.includes("--selftest")) {
  const silent = tab
    .replace(/const deleteMutation = useMutation\([\s\S]*?\n  \}\);/, "const deleteMutation = useMutation({ mutationFn: () => null });")
    .replace(/const openingMutation = useMutation\([\s\S]*?\n  \}\);/, "const openingMutation = useMutation({ mutationFn: () => null });")
    .replace(/data-testid="cash-flow-opening-error"/g, "data-testid=removed");
  const planted = mdpSilentMutationErrors(silent);
  if (planted.length !== 2) {
    console.error(`FAIL verify-mdp-fields SELFTEST: expected 2 planted silent-mutate problems, got ${planted.length}: ${planted.join("; ")}`);
    process.exit(1);
  }
  const live = mdpSilentMutationErrors(tab);
  if (live.length) {
    console.error(`FAIL verify-mdp-fields SELFTEST: live files flagged: ${live.join("; ")}`);
    process.exit(1);
  }
  console.log("PASS verify-mdp-fields --selftest");
  process.exit(0);
}

const silentLive = mdpSilentMutationErrors(tab);
if (silentLive.length) fail(silentLive.join("; "));
console.log("PASS verify-mdp-fields");
