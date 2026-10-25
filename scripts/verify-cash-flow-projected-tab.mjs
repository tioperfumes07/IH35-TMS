#!/usr/bin/env node
// ROUND 443.280-A #8 / FINAL-2 row 32 — Cash Flow › Projected (Auto) board.
// One engine (getRollingLedger), V3 formula + outlook + income/expense panels,
// D042 no-k outlook nets, D073 driver payee proper-case, no gray-* leftover chrome.
import fs from "node:fs";
import path from "node:path";

const REL = "apps/frontend/src/pages/cash-flow/tabs/DailyPredictionTab.tsx";

export function auditProjected(src) {
  const failures = [];
  if (!/getRollingLedger\b/.test(src)) {
    failures.push(`${REL}: must call getRollingLedger (one engine with Home / Rolling Ledger)`);
  }
  if (/\bgetDailyPrediction\b/.test(src)) {
    failures.push(`${REL}: still calls getDailyPrediction — dual-engine drift is forbidden on Projected`);
  }
  if (!/<BoardSection\b/.test(src) || !/<V3Segmented\b/.test(src)) {
    failures.push(`${REL}: missing BoardSection / V3Segmented — board chrome incomplete`);
  }
  for (const id of [
    "cash-flow-projected-v3",
    "cash-flow-projected-formula",
    "cash-flow-projected-outlook",
    "cash-flow-projected-income-panel",
    "cash-flow-projected-expense-panel",
    "cash-flow-projected-one-engine-note",
  ]) {
    if (!src.includes(id)) failures.push(`${REL}: missing data-testid "${id}"`);
  }
  if (!/OPENING CASH/.test(src) || !/PROJECTED CLOSING/.test(src)) {
    failures.push(`${REL}: formula strip labels missing OPENING CASH / PROJECTED CLOSING`);
  }
  if (!/function formatCompactNet/.test(src)) {
    failures.push(`${REL}: missing formatCompactNet for 7-day outlook`);
  }
  {
    const fn = src.match(/function formatCompactNet\([\s\S]*?\n\}/)?.[0] ?? "";
    if (/\/\s*1000/.test(fn) || /["']k["']/.test(fn) || /\+ "k"|\+ 'k'/.test(fn)) {
      failures.push(`${REL}: formatCompactNet must not abbreviate with k (D042)`);
    }
  }
  if (!/cents === 0\) return "—"/.test(src) && !/cents === 0\) return '—'/.test(src)) {
    failures.push(`${REL}: formatCompactNet must render zero as em dash (D042)`);
  }
  if (!/payeeNoun/.test(src) || !/"Driver"/.test(src)) {
    failures.push(`${REL}: driver bill/settlement payees must use entityLabel noun "Driver" (D073 proper case)`);
  }
  if (/border-gray-|bg-gray-|text-gray-/.test(src)) {
    failures.push(`${REL}: leftover gray-* Tailwind on Projected board — V3 tokens only`);
  }
  if (!/Thu|weekday|getUTCDay/.test(src) && !/fmtChipDate/.test(src)) {
    failures.push(`${REL}: outlook chips must use board weekday+MM-DD labels`);
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const good = `
import { getRollingLedger } from "x";
function formatCompactNet(cents) { if (cents === 0) return "—"; return "+1"; }
const payeeNoun = "Driver";
function fmtChipDate(iso) { const dow = new Date().getUTCDay(); return "Thu 10-22"; }
getRollingLedger();
<div data-testid="cash-flow-projected-v3" />
<div data-testid="cash-flow-projected-formula">OPENING CASH PROJECTED CLOSING</div>
<div data-testid="cash-flow-projected-outlook" />
<div data-testid="cash-flow-projected-income-panel" />
<div data-testid="cash-flow-projected-expense-panel" />
<div data-testid="cash-flow-projected-one-engine-note" />
<BoardSection /><V3Segmented />
`;
  const pass = auditProjected(good);
  if (pass.length) throw new Error("SELFTEST FAIL clean: " + JSON.stringify(pass));
  if (auditProjected(good.replace("getRollingLedger", "getDailyPrediction")).length === 0) {
    throw new Error("SELFTEST FAIL: dual engine undetected");
  }
  if (auditProjected(good + "\nborder-gray-200\n").length === 0) {
    throw new Error("SELFTEST FAIL: gray leftover undetected");
  }
  console.log("verify-cash-flow-projected-tab: SELFTEST PASS");
  process.exit(0);
}

const root = process.cwd();
const src = fs.readFileSync(path.join(root, REL), "utf8");
const failures = auditProjected(src);
if (failures.length) {
  console.error("verify-cash-flow-projected-tab FAILED:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("verify-cash-flow-projected-tab: OK — one engine, V3 board, D042/D073 locked");
