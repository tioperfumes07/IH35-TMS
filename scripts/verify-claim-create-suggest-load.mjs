#!/usr/bin/env node
/**
 * GUARD: ClaimCreateModal must call suggestExpenseLoad (going-forward trip stamp).
 *
 * DEFECT: Claim create had load/trailer/driver/unit pickers but never auto-detected the active
 * trip — operators left load_id NULL even when the unit was on a dispatched load (Insurance chain
 * never exercised end-to-end on live USMCA rows).
 *
 * Rule 17: wired via verify-steps/3130-… only.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MODAL = "apps/frontend/src/components/insurance/ClaimCreateModal.tsx";
const LABEL = "verify-claim-create-suggest-load";
const SELFTEST = process.argv.includes("--selftest");

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

export function assertClaimCreateSuggestLoad(sources) {
  const src = sources?.[MODAL] ?? read(MODAL);
  const problems = [];
  if (!src.includes("suggestExpenseLoad")) {
    problems.push(`${MODAL}: missing suggestExpenseLoad import/call — claim create must auto-stamp active trip.`);
  }
  if (!src.includes('"suggest-load"') && !src.includes("'suggest-load'")) {
    problems.push(`${MODAL}: suggest-load queryKey missing.`);
  }
  if (!src.includes("claim-create-load-suggested")) {
    problems.push(`${MODAL}: missing data-testid claim-create-load-suggested for auto-fill honesty.`);
  }
  return problems;
}

function main() {
  if (SELFTEST) {
    const ok = assertClaimCreateSuggestLoad();
    if (ok.length) {
      console.error(`${LABEL} SELFTEST FAIL — current tree broken:\n- ${ok.join("\n- ")}`);
      process.exit(1);
    }
    const broken = assertClaimCreateSuggestLoad({
      [MODAL]: read(MODAL)
        .replace(/suggestExpenseLoad/g, "NOT_SUGGEST")
        .replace(/suggest-load/g, "nope")
        .replace(/claim-create-load-suggested/g, "gone"),
    });
    if (broken.length < 2) {
      console.error(`${LABEL} SELFTEST FAIL — planted defect weak (${broken.length})`);
      process.exit(1);
    }
    console.log(`${LABEL} SELFTEST PASS (${broken.length} planted failures)`);
    process.exit(0);
  }
  const problems = assertClaimCreateSuggestLoad();
  if (problems.length) {
    console.error(`${LABEL} FAIL:\n- ${problems.join("\n- ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} PASS`);
}

main();
