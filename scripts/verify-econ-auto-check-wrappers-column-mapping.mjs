#!/usr/bin/env node
/**
 * The 6 thin INV wrappers (packet 8/9, made real 2026-08-30, ACCT-F10125) each pass a
 * `columnId` into runInvWrapper's --live path, which resolves it against econ-proofs.mjs's
 * ECON_PROOFS map. A typo here (or a copy-paste that leaves the wrong columnId on a wrapper)
 * would silently make verify-gl-delta-matches-matrix.mjs --live replay, say, the C31 proof
 * instead of C25's -- the exact class of "wrapper looks wired, checks the wrong thing" defect
 * this whole effort exists to prevent. Asserts each wrapper's columnId (1) is a real key in
 * ECON_PROOFS, and (2) matches the column its own filename/label claims to check.
 */
import { readFileSync } from "node:fs";
import { ECON_PROOFS } from "./proof-engine/econ-proofs.mjs";

const EXPECTED = {
  "verify-gl-delta-matches-matrix.mjs": "gl_delta",
  "verify-subledger-tieout.mjs": "subledger_tie",
  "verify-no-stranded-intermediate.mjs": "lifecycle_complete",
  "verify-period-and-date-guard.mjs": "period_guard",
  "verify-posting-flag-has-roles.mjs": "entity_isolation",
  "verify-non-empty-certification.mjs": "non_empty_proof",
};

function analyze(readFile) {
  const failures = [];
  for (const [file, expectedColumnId] of Object.entries(EXPECTED)) {
    const src = readFile(`scripts/${file}`);
    const m = src.match(/columnId:\s*"([^"]+)"/);
    if (!m) {
      failures.push(`${file}: no columnId found -- --live would FAIL CLOSED with a missing-columnId error, not replay anything`);
      continue;
    }
    const got = m[1];
    if (got !== expectedColumnId) {
      failures.push(`${file}: columnId is "${got}", expected "${expectedColumnId}" -- --live would replay the WRONG column's proof`);
    }
    if (!(got in ECON_PROOFS)) {
      failures.push(`${file}: columnId "${got}" is not a real key in econ-proofs.mjs's ECON_PROOFS`);
    }
  }
  return failures;
}

function realReadFile(rel) {
  return readFileSync(rel, "utf8");
}

function selftest() {
  const live = analyze(realReadFile);
  if (live.length) {
    console.error("verify-econ-auto-check-wrappers-column-mapping --selftest: FAIL on the real (good) files");
    for (const f of live) console.error(`  - ${f}`);
    process.exit(1);
  }

  // Plant: swap two wrappers' columnId with each other's -- both must be caught.
  const swapped = (rel) => {
    if (rel.endsWith("verify-gl-delta-matches-matrix.mjs")) return realReadFile(rel).replace('columnId: "gl_delta"', 'columnId: "non_empty_proof"');
    if (rel.endsWith("verify-non-empty-certification.mjs")) return realReadFile(rel).replace('columnId: "non_empty_proof"', 'columnId: "gl_delta"');
    return realReadFile(rel);
  };
  const mutated = analyze(swapped);
  const caughtBoth =
    mutated.some((f) => f.includes("verify-gl-delta-matches-matrix.mjs") && f.includes('expected "gl_delta"')) &&
    mutated.some((f) => f.includes("verify-non-empty-certification.mjs") && f.includes('expected "non_empty_proof"'));
  if (!caughtBoth) {
    console.error("verify-econ-auto-check-wrappers-column-mapping --selftest: NOT CAUGHT -- swapped columnId between two wrappers");
    for (const f of mutated) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("  caught: swapped columnId between two wrappers (both directions)");

  // Plant: a columnId that doesn't exist in ECON_PROOFS at all.
  const bogus = (rel) =>
    rel.endsWith("verify-gl-delta-matches-matrix.mjs") ? realReadFile(rel).replace('columnId: "gl_delta"', 'columnId: "does_not_exist"') : realReadFile(rel);
  const mutated2 = analyze(bogus);
  if (!mutated2.some((f) => f.includes("is not a real key"))) {
    console.error("verify-econ-auto-check-wrappers-column-mapping --selftest: NOT CAUGHT -- columnId pointing nowhere");
    process.exit(1);
  }
  console.log("  caught: columnId pointing at a non-existent ECON_PROOFS key");

  console.log("SELFTEST PASS: 2/2 planted regressions caught.");
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  const failures = analyze(realReadFile);
  if (failures.length) {
    console.error("verify-econ-auto-check-wrappers-column-mapping: FAIL");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("verify-econ-auto-check-wrappers-column-mapping: OK -- all 6 thin wrappers' columnId matches the column they claim to check");
}
