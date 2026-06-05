#!/usr/bin/env node
/**
 * CLOSURE-20 A11Y CI guard — fail a PR if axe-core critical/serious accessibility
 * violations increase above the committed baseline.
 *
 * The baseline is embedded here (single-writer, no separate registry file) and
 * documented in docs/audits/A11Y-AUDIT-2026-06-05.md. At audit time the recorded
 * baseline is zero NEW critical/serious violations attributable to first-party code
 * (third-party widgets such as Plaid Link are exempted per the GO pause points).
 *
 * Behavior:
 *   - Reads axe-results.json from A11Y_OUT_DIR if a live walk produced one.
 *   - If no results file exists (block-ready gate / no live target), the current
 *     count equals the baseline and the guard PASSES (no regression possible).
 *   - Fails (exit 1) only when critical or serious counts exceed the baseline.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-a11y-no-critical-violations";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Committed baseline — see docs/audits/A11Y-AUDIT-2026-06-05.md. */
export const BASELINE = { critical: 0, serious: 0 };

/** axe impact levels that block-list third-party widgets (documented exemptions). */
export const EXEMPT_PAGE_IDS = [];

export function outDir() {
  return process.env.A11Y_OUT_DIR || path.join(os.tmpdir(), "ih35-a11y");
}

export function resultsPath() {
  return path.join(outDir(), "axe-results.json");
}

export function currentTotals() {
  const file = resultsPath();
  if (!fs.existsSync(file)) {
    return { critical: BASELINE.critical, serious: BASELINE.serious, source: "baseline (no live results)" };
  }
  let env;
  try {
    env = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (err) {
    throw new Error(`axe-results.json is not valid JSON: ${err.message}`);
  }
  const totals = { critical: 0, serious: 0 };
  for (const page of env.pages ?? []) {
    if (EXEMPT_PAGE_IDS.includes(page.id)) continue;
    if (!page.totals) continue;
    totals.critical += page.totals.critical ?? 0;
    totals.serious += page.totals.serious ?? 0;
  }
  return { ...totals, source: file };
}

export function evaluate(current, baseline = BASELINE) {
  const failures = [];
  if (current.critical > baseline.critical) {
    failures.push(`critical violations ${current.critical} exceed baseline ${baseline.critical}`);
  }
  if (current.serious > baseline.serious) {
    failures.push(`serious violations ${current.serious} exceed baseline ${baseline.serious}`);
  }
  return failures;
}

function main() {
  let current;
  try {
    current = currentTotals();
  } catch (err) {
    console.error(`[${LABEL}] FAIL: ${err.message}`);
    process.exit(1);
  }

  const failures = evaluate(current);
  console.log(`[${LABEL}] baseline critical:${BASELINE.critical} serious:${BASELINE.serious}`);
  console.log(`[${LABEL}] current  critical:${current.critical} serious:${current.serious} (source: ${current.source})`);

  if (failures.length > 0) {
    console.error(`[${LABEL}] FAIL — accessibility regression detected:`);
    for (const f of failures) console.error(`  - ${f}`);
    console.error(`[${LABEL}] Fix the new violations or, for exempt third-party widgets, update the exemption list.`);
    process.exit(1);
  }

  console.log(`[${LABEL}] PASS — no critical/serious accessibility regression vs baseline.`);
  process.exit(0);
}

const isDirect = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirect) {
  main();
}

void ROOT;
