#!/usr/bin/env node
/**
 * FINDING: LV-FACTORING-ACTIVE-FACTOR-COUNT-HARDCODED (carries ACCT-F5399) — found live 2026-08-17
 * while performing the assigned factoring Wave C1 live-verify of the `home.statements_settings` leaf.
 * Selected-USMCA `/factoring/statements-settings` simultaneously showed "ACTIVE FACTOR: Faro
 * Factoring" with real rate/config data AND "Single-factor invariant status: Active factors: 0 ·
 * Status: Compliant" a few lines below it — a self-contradictory display on the same page.
 *
 * ROOT CAUSE: both the /api/v1/factoring/summary and /api/v1/factoring/statements-settings routes'
 * no-data-yet fallback objects in apps/backend/src/factoring/factoring.routes.ts hardcoded
 * `active_factor_count: 0` unconditionally, even on the exact code path that had just successfully
 * resolved a real `activeFactor` a few lines above (via resolveCanonicalActiveFactor). USMCA has a
 * real active factor (Faro Factoring) but zero generated statement rows yet, so the
 * statements-settings route always hit this fallback and always showed 0.
 *
 * FIX: both fallback sites now derive `active_factor_count` from the already-resolved `activeFactor`
 * (1 if present, 0 if not) instead of a bare literal 0.
 *
 * Static check (always runs): both fallback sites reference `activeFactor` (or `summary.activeFactor`)
 * in their `active_factor_count` expression, not a bare `0` literal.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-factoring-active-factor-count-not-hardcoded";
const TARGET_REL = "apps/backend/src/factoring/factoring.routes.ts";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

/** Pure so the selftest can run it against a mutated in-memory copy. */
export function assertActiveFactorCountDerived(source) {
  const errors = [];
  const matches = [...source.matchAll(/active_factor_count:\s*([^,\n]+),/g)].map((m) => m[1].trim());

  if (matches.length < 2) {
    errors.push(`only ${matches.length} of 2 expected active_factor_count assignment sites found`);
  }
  for (const expr of matches) {
    if (/^0$/.test(expr)) {
      errors.push(`active_factor_count hardcoded to a bare 0 literal (expr: "${expr}")`);
    }
  }
  return errors;
}

function selftest() {
  const problems = [];
  const live = read(TARGET_REL);

  const liveErrors = assertActiveFactorCountDerived(live);
  if (liveErrors.length) problems.push(`live source rejected: ${liveErrors.join("; ")}`);

  const cases = [
    [
      "both sites reverted to hardcoded 0",
      live.replace(/active_factor_count:\s*[^,\n]+,/g, "active_factor_count: 0,"),
      "hardcoded to a bare 0 literal",
    ],
  ];

  for (const [name, mutated, expectFragment] of cases) {
    if (mutated === live) {
      problems.push(`planted regression "${name}" did not actually mutate the source — the selftest is inert`);
      continue;
    }
    const found = assertActiveFactorCountDerived(mutated);
    if (!found.some((e) => e.includes(expectFragment))) {
      problems.push(`planted regression "${name}" was NOT caught — assertion is ineffective`);
    }
  }

  if (problems.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const p of problems) console.error("  •", p);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — live source clean; ${cases.length} planted regressions caught`);
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }

  const errors = assertActiveFactorCountDerived(read(TARGET_REL));
  if (errors.length) {
    console.error(`${LABEL} FAILED\n- ${errors.join("\n- ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} — OK`);
}

main();
