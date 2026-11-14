#!/usr/bin/env node
/**
 * verify-unexpected-kpi-drills — ROUND 8.20 board2.
 * Unexpected expenses KPI tiles + by-kind amounts must drill Banking for-review (+ret).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-unexpected-kpi-drills";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = "apps/frontend/src/pages/accounting/UnexpectedExpensesPage.tsx";

export function check(src) {
  const f = [];
  if (!src) return ["UnexpectedExpensesPage.tsx missing"];
  if (!/unexpectedBankingHref/.test(src)) f.push("unexpectedBankingHref helper missing");
  if (!/statementMonthBounds/.test(src)) f.push("must use statementMonthBounds for month date_from/date_to");
  if (!/withReturnContext/.test(src)) f.push("must attach ret via withReturnContext");
  if (!/types=money_out|types:\s*"money_out"/.test(src)) f.push("banking drill must use types=money_out");
  if (!/review:\s*"for_review"|review=for_review/.test(src)) f.push("banking drill must use review=for_review");
  if (!/href=\{query\.isLoading \|\| !kpis \? undefined : bankingMonthHref\}/.test(src)) {
    f.push("KPI tiles must set href=bankingMonthHref when loaded");
  }
  if (!/unexpected-kind-amount-/.test(src)) f.push("by-kind amount drill test id missing");
  if (/key: "amount_cents"[\s\S]{0,220}formatPlainDollars\(row\.amount_cents\)\s*,/.test(src)) {
    f.push("by-kind amount still plain formatPlainDollars");
  }
  return f;
}

function selftest(src) {
  const cases = [
    ["no helper", src.replace(/unexpectedBankingHref/g, "noop")],
    ["no ret", src.replace(/withReturnContext/g, "plainJoin")],
    ["plain by-kind", src.replace(/unexpected-kind-amount-/g, "plain-")],
  ];
  let pass = check(src).length === 0 ? 1 : 0;
  if (!pass) console.error(`${LABEL} --selftest: live tree fails`, check(src));
  for (const [name, s] of cases) {
    if (check(s).length > 0) pass += 1;
    else console.error(`${LABEL} --selftest: did not catch "${name}"`);
  }
  const total = cases.length + 1;
  if (pass !== total) {
    console.error(`${LABEL} --selftest FAIL ${pass}/${total}`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS ${pass}/${total}`);
}

const src = fs.existsSync(path.join(ROOT, PAGE)) ? fs.readFileSync(path.join(ROOT, PAGE), "utf8") : "";
if (process.argv.includes("--selftest")) selftest(src);
else {
  const f = check(src);
  if (f.length) {
    for (const x of f) console.error(`${LABEL}: FAIL — ${x}`);
    process.exit(1);
  }
  console.log(`${LABEL}: PASS — Unexpected KPIs/by-kind drill Banking for-review with ret`);
}
