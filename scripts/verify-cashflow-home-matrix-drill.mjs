#!/usr/bin/env node
/**
 * Cash Flow Home matrix cell → Rolling Ledger week/type provenance.
 * Codex QA 11-02: invoice-week click must not open generic "today" ledger.
 *
 * Guards:
 *  - CashFlowPage setActiveTab accepts CashFlowNavOpts and writes rl_from/rl_to/rl_types/rl_kind
 *  - CashFlowHomeTab matrixDrillOpts / ThirteenWeekTable pass week range + type
 *  - Invoice row drills with Invoice type + income kind
 *  - Net/Ending drills carry scenario + component cents; Rolling Ledger shows breakdown banner
 *  - Bare onOpen("rolling_ledger") without opts is gone from matrix cells
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-cashflow-home-matrix-drill";
const PAGE = "apps/frontend/src/pages/cash-flow/CashFlowPage.tsx";
const HOME = "apps/frontend/src/pages/cash-flow/tabs/CashFlowHomeTab.tsx";
const LEDGER = "apps/frontend/src/pages/cash-flow/tabs/RollingLedgerTab.tsx";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function assertIncludes(src, needle, where) {
  if (!src.includes(needle)) throw new Error(`${LABEL}: missing ${JSON.stringify(needle)} in ${where}`);
}

function assertMatch(src, re, where) {
  if (!re.test(src)) throw new Error(`${LABEL}: missing /${re.source}/ in ${where}`);
}

function audit({ pageSrc, homeSrc, ledgerSrc }) {
  const failures = [];

  for (const needle of [
    "export type CashFlowNavOpts",
    'params.set("rl_from"',
    'params.set("rl_to"',
    'params.set("rl_types"',
    'params.set("rl_kind"',
    'params.set("rl_explain"',
    'params.set("rl_scenario"',
    'params.set("rl_net"',
    "RL_PARAM_KEYS",
  ]) {
    if (!pageSrc.includes(needle)) failures.push(`CashFlowPage missing ${needle}`);
  }

  for (const needle of [
    "function matrixDrillOpts",
    "function netEndingDrillOpts",
    "function bucketRange",
    'rl_types: "Invoice,Factor advance,Load (not invoiced)"',
    'rl_kind: "income"',
    'rl_types: "Loan payment"',
    'rl_types: "Driver pay,Driver bill"',
    'rl_types: "Bill"',
    'rl_explain: explain',
    "onOpen(\"rolling_ledger\", matrixDrillOpts",
    "scenario={scenario}",
    "CashFlowNavOpts",
  ]) {
    if (!homeSrc.includes(needle)) failures.push(`CashFlowHomeTab missing ${needle}`);
  }

  // Matrix must not call bare onOpen("rolling_ledger") without opts (the Codex defect).
  // Allow KPI/view-all paths that pass opts via openSibling("rolling_ledger", { ... }).
  if (/onOpen\(\s*["']rolling_ledger["']\s*\)/.test(homeSrc)) {
    failures.push('CashFlowHomeTab still has bare onOpen("rolling_ledger") without opts');
  }

  // Rolling Ledger must still seed from/to from URL + Home Net breakdown banner.
  for (const needle of [
    'searchParams.get("rl_from")',
    'searchParams.get("rl_to")',
    'searchParams.get("rl_types")',
    'searchParams.get("rl_kind")',
    'searchParams.get("rl_explain")',
    'testId="cash-flow-rolling-home-net-breakdown"',
  ]) {
    if (!ledgerSrc.includes(needle)) failures.push(`RollingLedgerTab missing ${needle}`);
  }

  return failures;
}

function selftest() {
  const goodPage = `
export type CashFlowNavOpts = { rl_from?: string };
const RL_PARAM_KEYS = ["rl_from"];
params.set("rl_from", opts.rl_from);
params.set("rl_to", opts.rl_to);
params.set("rl_types", opts.rl_types);
params.set("rl_kind", opts.rl_kind);
params.set("rl_explain", opts.rl_explain);
params.set("rl_scenario", opts.rl_scenario);
params.set("rl_net", opts.rl_net);
`;
  const goodHome = `
import type { CashFlowNavOpts } from "../CashFlowPage";
function bucketRange(bucket) { return { from: "a", to: "b" }; }
function netEndingDrillOpts(explain, bucket, scenario) { return { rl_explain: explain, rl_scenario: scenario }; }
function matrixDrillOpts(row, bucket, scenario) {
  return { rl_from: "a", rl_to: "b", rl_kind: "income", rl_types: "Invoice,Factor advance,Load (not invoiced)" };
}
onOpen("rolling_ledger", matrixDrillOpts(rowKey, w, scenario));
scenario={scenario}
rl_types: "Loan payment"
rl_types: "Driver pay,Driver bill"
rl_types: "Bill"
rl_explain: explain
`;
  const goodLedger = `
searchParams.get("rl_from")
searchParams.get("rl_to")
searchParams.get("rl_types")
searchParams.get("rl_kind")
searchParams.get("rl_explain")
testId="cash-flow-rolling-home-net-breakdown"
`;

  const pass = audit({ pageSrc: goodPage, homeSrc: goodHome, ledgerSrc: goodLedger });
  if (pass.length) throw new Error(`SELFTEST FAIL (should be clean): ${JSON.stringify(pass)}`);

  const bare = goodHome.replace(
    'onOpen("rolling_ledger", matrixDrillOpts(rowKey, w, scenario));',
    'onOpen("rolling_ledger");',
  );
  const bareFails = audit({ pageSrc: goodPage, homeSrc: bare, ledgerSrc: goodLedger });
  if (!bareFails.some((f) => f.includes("bare onOpen"))) {
    throw new Error("SELFTEST FAIL: bare onOpen went undetected");
  }

  const noOpts = goodHome.replace("function matrixDrillOpts", "function matrixDrillX");
  if (audit({ pageSrc: goodPage, homeSrc: noOpts, ledgerSrc: goodLedger }).length === 0) {
    throw new Error("SELFTEST FAIL: missing matrixDrillOpts went undetected");
  }

  console.log(`${LABEL}: SELFTEST PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const failures = audit({
  pageSrc: read(PAGE),
  homeSrc: read(HOME),
  ledgerSrc: read(LEDGER),
});
if (failures.length) {
  console.error(`${LABEL} FAILED:`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`${LABEL}: OK — Home matrix cells pass rl_* provenance + Net/Ending breakdown into Rolling Ledger`);
