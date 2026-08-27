#!/usr/bin/env node
/**
 * INS-F6883-CLAIM-GRAPH-EIGHT-FAMILY-SILENT-50-CAPS (continuity-chain half)
 *
 * The board row bundled two claims. Verified against the real current code before building:
 * (1) "hard-caps accidents/lawsuits/matters/incidents/continuity chains/expenses/bills/work orders
 *     at 50" — FALSE. Grepped apps/backend/src/insurance/claim.routes.ts: every LIMIT in the file
 *     is `LIMIT 1` (single-row lookups); the graph endpoint's 8 reverse-fan-out queries carry no
 *     LIMIT at all. Grepped ClaimsTab.tsx and insurance.ts for a client-side `.slice(0, 50)` or
 *     similar — none exists either. There is no cap to fix.
 * (2) "the UI omits continuity chains entirely" — TRUE. The backend graph endpoint and the
 *     InsuranceClaimGraph type have always carried `reverse.damage_continuity_chains`, but
 *     ClaimsTab.tsx never rendered it (confirmed: zero references before this fix) and the
 *     panel's own "none linked yet" emptiness check didn't account for it either — a real chain
 *     could exist and render as if nothing were linked.
 *
 * This guard locks (2): damage_continuity_chains must be mapped/rendered in the reverse panel and
 * included in the emptiness check.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const FILE = "apps/frontend/src/pages/insurance/ClaimsTab.tsx";

export function check(src) {
  const failures = [];

  if (!/graph\.reverse\.damage_continuity_chains\.map\(\(chain\) => \(/.test(src)) {
    failures.push(`${FILE}: damage_continuity_chains is no longer mapped/rendered in the reverse panel`);
  }
  if (!/data-testid=\{`claim-reverse-continuity-chain-\$\{chain\.id\}`\}/.test(src)) {
    failures.push(`${FILE}: the rendered continuity-chain element lost its data-testid`);
  }
  if (!/graph\.reverse\.damage_continuity_chains\.length === 0 &&/.test(src)) {
    failures.push(`${FILE}: the "none linked yet" emptiness check no longer accounts for damage_continuity_chains — a real linked chain could render as if nothing were linked`);
  }

  return failures;
}

function run() {
  const src = fs.readFileSync(path.join(root, FILE), "utf8");
  const failures = check(src);
  if (failures.length > 0) {
    console.error("FAIL: insurance-claim-graph-continuity-chain-rendered");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("PASS: Insurance Claim graph's reverse panel renders damage_continuity_chains and accounts for it in the emptiness check");
}

function selftest() {
  const src = fs.readFileSync(path.join(root, FILE), "utf8");
  const baseline = check(src);
  if (baseline.length !== 0) {
    console.error("FAIL(selftest): baseline (current HEAD) is not clean:", baseline);
    process.exit(1);
  }

  // Mutation 1: the entire continuity-chain render block is removed (the exact pre-fix shape).
  const offenderA = src.replace(
    /\{graph\.reverse\.damage_continuity_chains\.map\(\(chain\) => \([\s\S]*?\)\)\}\n/,
    ""
  );
  if (offenderA === src) {
    console.error("FAIL(selftest): offender A mutation did not change the file — pattern out of sync");
    process.exit(1);
  }
  const failuresA = check(offenderA);
  if (failuresA.length === 0) {
    console.error("FAIL(selftest): planted offender (continuity-chain render removed) was NOT caught");
    process.exit(1);
  }

  // Mutation 2: the emptiness check no longer accounts for it (render stays, but "none linked yet"
  // could fire even when a chain exists).
  const offenderB = src.replace("graph.reverse.damage_continuity_chains.length === 0 &&\n", "");
  if (offenderB === src) {
    console.error("FAIL(selftest): offender B mutation did not change the file — pattern out of sync");
    process.exit(1);
  }
  const failuresB = check(offenderB);
  if (failuresB.length === 0) {
    console.error("FAIL(selftest): planted offender (emptiness check dropped) was NOT caught");
    process.exit(1);
  }

  console.log("PASS(selftest): both planted regressions correctly caught; baseline clean");
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  run();
}
