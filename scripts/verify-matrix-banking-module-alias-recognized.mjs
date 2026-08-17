#!/usr/bin/env node
/**
 * FINDING: LV-MATRIX-BANKING-MODULE-ALIAS-INVISIBLE (carries ACCT-F5402) — found live 2026-08-17
 * while re-measuring the Program Matrix per the standing auto-chain instruction ("re-fetch matrix;
 * any CC-1 module Live%<90 → unpaid leaves from required.json"). Banking measured `livePct: 0` on
 * `/program/matrix` (live GET /api/v1/program/module-matrix?scope=system) despite dozens of real
 * PROD-VERIFIED AUDIT-COVERAGE-LIVE.md rows for Banking dating back to 2026-08-02 (rows
 * 431/442/618/661/1077/1078, etc.).
 *
 * ROOT CAUSE: two independently-maintained normalization tables disagree on Banking's canonical id.
 * `scripts/audit-coverage-scoreboard.mjs`'s own SIDEBAR_ITEM_IDS/MODULE_ALIASES canonicalizes the
 * ledger's `Module` column to "bank" (both "banking" and "bank" alias to `{ id: "bank" }` — confirmed
 * the ONLY such mismatch across all 30 modules by diffing required.json filenames against every
 * MODULE_ALIASES target id). `module-matrix.service.ts`'s `rowTouchesModule()` tested
 * `/^banking\b/i` against `row.module` — which never matches a string starting with "bank" (shorter
 * than "banking"). Every Banking ledger row was therefore invisible to Box4 Live%, for every agent,
 * for the module's entire history.
 *
 * FIX: `rowTouchesModule()` now also accepts the ledger's own canonical alias ("bank") as a match
 * candidate when moduleId is "banking" — additive, widens the matcher, narrows nothing.
 *
 * Static check (always runs): module-matrix.service.ts's rowTouchesModule references a
 * banking→bank alias table and consults it (not just moduleId) when testing row.module.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-matrix-banking-module-alias-recognized";
const TARGET_REL = "apps/backend/src/program/module-matrix.service.ts";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

/** Pure so the selftest can run it against a mutated in-memory copy. */
export function assertBankingAliasRecognized(source) {
  const errors = [];

  const fnMatch = source.match(/function rowTouchesModule\([\s\S]*?\n\}/);
  if (!fnMatch) {
    errors.push("rowTouchesModule function not found");
    return errors;
  }
  const fnBody = fnMatch[0];

  if (!/banking:\s*\[\s*"bank"\s*\]/.test(source)) {
    errors.push('no LEDGER_MODULE_ALIASES entry mapping "banking" -> ["bank"] found');
  }
  if (!/LEDGER_MODULE_ALIASES/.test(fnBody)) {
    errors.push("rowTouchesModule does not consult LEDGER_MODULE_ALIASES");
  }
  // Guard against a regression that reverts to the bare single-candidate regex.
  if (/^\s*return new RegExp\(`\^\$\{moduleId\}\\\\b`, "i"\)\.test\(row\.module\.trim\(\)\);\s*$/m.test(fnBody)) {
    errors.push("rowTouchesModule reverted to the single-candidate ^${moduleId}\\b regex");
  }

  return errors;
}

function selftest() {
  const problems = [];
  const live = read(TARGET_REL);

  const liveErrors = assertBankingAliasRecognized(live);
  if (liveErrors.length) problems.push(`live source rejected: ${liveErrors.join("; ")}`);

  const cases = [
    [
      "alias table deleted, function reverted to single-candidate regex",
      live
        .replace(/const LEDGER_MODULE_ALIASES[\s\S]*?\};\n\n/, "")
        .replace(
          /function rowTouchesModule\([\s\S]*?\n\}/,
          'function rowTouchesModule(row, moduleId) {\n  return new RegExp(`^${moduleId}\\b`, "i").test(row.module.trim());\n}',
        ),
      "no LEDGER_MODULE_ALIASES entry",
    ],
  ];

  for (const [name, mutated, expectFragment] of cases) {
    if (mutated === live) {
      problems.push(`planted regression "${name}" did not actually mutate the source — the selftest is inert`);
      continue;
    }
    const found = assertBankingAliasRecognized(mutated);
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

  const errors = assertBankingAliasRecognized(read(TARGET_REL));
  if (errors.length) {
    console.error(`${LABEL} FAILED\n- ${errors.join("\n- ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} — OK`);
}

main();
