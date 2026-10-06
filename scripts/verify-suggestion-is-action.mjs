#!/usr/bin/env node
/**
 * ROUND 433-CUR #3 / r388 — suggestionIsAction on banking Action column.
 *
 * Lead measured: git grep suggestionIsAction on origin/main → nothing.
 * QBO Action column: the chosen suggestion IS the action the operator clicks
 * (Match / Add / Record transfer) — never a separate "Action type" label.
 *
 * Usage:
 *   node scripts/verify-suggestion-is-action.mjs
 *   node scripts/verify-suggestion-is-action.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-suggestion-is-action";
const VIEW = path.join(
  ROOT,
  "apps/frontend/src/pages/banking/components/BankingTransactionsDesignView.tsx",
);

export function checkView(source) {
  const hasFn = /export\s+function\s+suggestionIsAction\b/.test(source);
  const hasQboLabel = /export\s+function\s+qboActionLabel\b/.test(source);
  // Action button renders via suggestionIsAction → qboActionLabel (or suggestionIsAction wraps label).
  const usesSuggestion = /\bsuggestionIsAction\s*\(/.test(
    source.replace(/export\s+function\s+suggestionIsAction[\s\S]*?\n\}/, ""),
  );
  const usesQboOnButton = /qboActionLabel\s*\(/.test(source);
  const bankActionMarker = /BANK-ACTION-QBO-01/.test(source);
  return { hasFn, hasQboLabel, usesSuggestion, usesQboOnButton, bankActionMarker };
}

function selftest() {
  const ok = checkView(`
export function qboActionLabel(mode) { return mode; }
export function suggestionIsAction() { return true; }
/* BANK-ACTION-QBO-01 */
{suggestionIsAction() ? qboActionLabel(getDraft(tx).mode) : "x"}
`);
  const bad = checkView(`export function other(){}`);
  const fails = [];
  if (!ok.hasFn || !ok.hasQboLabel || !ok.usesSuggestion || !ok.usesQboOnButton || !ok.bankActionMarker) {
    fails.push("ok-source");
  }
  if (bad.hasFn || bad.usesSuggestion) fails.push("bad-source");
  if (fails.length) {
    console.error(`${LABEL} --selftest FAIL`, fails);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS`);
}

function main() {
  if (process.argv.includes("--selftest")) return selftest();
  if (!fs.existsSync(VIEW)) {
    console.error(`${LABEL} FAIL — missing ${path.relative(ROOT, VIEW)}`);
    process.exit(1);
  }
  const source = fs.readFileSync(VIEW, "utf8");
  const r = checkView(source);
  const problems = [];
  if (!r.hasFn) problems.push("BankingTransactionsDesignView must export function suggestionIsAction");
  if (!r.hasQboLabel) problems.push("qboActionLabel must remain (Action button label)");
  if (!r.usesSuggestion) problems.push("suggestionIsAction() must be called at the Action column render site");
  if (!r.usesQboOnButton) problems.push("Action column must call qboActionLabel for the button text");
  if (!r.bankActionMarker) problems.push("BANK-ACTION-QBO-01 marker must remain on the Action column");
  if (problems.length) {
    console.error(`${LABEL} FAIL — ${problems.length} problem(s):`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(
    `${LABEL} OK — suggestionIsAction exported+used; qboActionLabel on Action button (${path.relative(ROOT, VIEW)})`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
