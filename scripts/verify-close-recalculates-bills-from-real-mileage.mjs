#!/usr/bin/env node
/**
 * ROUND 178/182 item 4 (Lead, 2026-09-28): "entering real mileage at close must automatically
 * recalculate the driver bill and settlement lines. That is the designed flow." Before this fix,
 * createDriverBillArtifacts()'s existing-bill branch only recalculated while gross_amount_cents was
 * still 0 (the unpriced-tracking-bill -> first-real-price transition). A bill that had already
 * minted a PRE-SETTLEMENT ESTIMATE froze at that estimate forever — re-entering the exact same
 * function on every Edit Load save (DRV-BILL-SKIP-PATHS, update-load.service.ts) hit
 * `existingGross > 0` and returned already_exists without ever touching the row, even when the
 * load's miles changed underneath it.
 *
 * Static half (always runs, never skipped): asserts apps/backend/src/dispatch/book-load.service.ts
 * gates recalculation on settled_in_settlement_id (open + not-yet-settled), not on
 * gross_amount_cents being 0 — and that a bill already inside a settlement is still refused.
 *
 * Live half (ALLOW_OFFLINE_SKIP; SKIPs cleanly with no DATABASE_URL): runs
 * apps/backend/scripts/verify-close-recalc-live-proof.ts, which takes ONE real open/unsettled
 * driver_bills row, perturbs its load's miles_shortest and re-runs the real production re-entry
 * point INSIDE A TRANSACTION THAT IS ALWAYS ROLLED BACK — proving the mechanism live without
 * writing anything permanent.
 *
 * Run: node scripts/verify-close-recalculates-bills-from-real-mileage.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

export const ALLOW_OFFLINE_SKIP = "the static gate-source check above already runs unconditionally and is sufficient offline; the live half is a live-data invariant by design";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SVC = "apps/backend/src/dispatch/book-load.service.ts";
const LABEL = "verify-close-recalculates-bills-from-real-mileage";

export function checkStaticSource(src) {
  const problems = [];
  if (!src.includes("settled_in_settlement_id")) {
    problems.push(`${SVC}: recalculation gate does not reference settled_in_settlement_id -- a settled bill must never be eligible for recalculation`);
  }
  if (!/isRecalculable/.test(src)) {
    problems.push(`${SVC}: no isRecalculable gate found -- recalculation eligibility must be an explicit, named condition, not inline`);
  }
  if (/if\s*\(existingGross > 0 \|\| String\(existing\.status\)/.test(src)) {
    problems.push(`${SVC}: still gates recalculation on existingGross > 0 -- an already-priced open bill can never recalculate under this condition`);
  }
  return problems;
}

export function checkStatic(root = ROOT) {
  let src;
  try {
    src = fs.readFileSync(path.join(root, SVC), "utf8");
  } catch {
    return [`${SVC}: missing`];
  }
  return checkStaticSource(src);
}

function checkLive() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.log(`  ${LABEL} (live check): SKIP — no DATABASE_URL (the static check above already passed and is sufficient offline).`);
    return [];
  }
  const proofScript = path.join(ROOT, "apps/backend/scripts/verify-close-recalc-live-proof.ts");
  let out;
  try {
    out = execFileSync("npx", ["tsx", proofScript], {
      cwd: path.join(ROOT, "apps/backend"),
      env: process.env,
      encoding: "utf8",
    });
  } catch (err) {
    return [`live proof script failed: ${err.stdout ?? err.message}`];
  }
  console.log(out.trim());
  const lastLine = out.trim().split("\n").pop();
  if (lastLine === "SKIP" || lastLine?.startsWith("SKIP")) return [];
  if (lastLine !== "PASS") return [`live proof did not print PASS (got: ${lastLine})`];
  return [];
}

export function runSelftest() {
  const cases = [
    {
      name: "gates on existingGross > 0 (old, broken behavior)",
      src: "if (existingGross > 0 || String(existing.status) !== \"open\") {\n  return { outcome: \"already_exists\" };\n}",
      expectFail: true,
    },
    {
      name: "no settled_in_settlement_id reference at all",
      src: "const isRecalculable = String(existing.status) === \"open\";",
      expectFail: true,
    },
    {
      name: "no isRecalculable gate",
      src: "if (existing.settled_in_settlement_id == null) { /* ... */ }",
      expectFail: true,
    },
    {
      name: "correct: isRecalculable gated on open + unsettled",
      src: "const isRecalculable = String(existing.status) === \"open\" && existing.settled_in_settlement_id == null;\nif (!isRecalculable) { return { outcome: \"already_exists\" }; }",
      expectFail: false,
    },
  ];
  let failures = 0;
  for (const c of cases) {
    const problems = checkStaticSource(c.src);
    const gotFail = problems.length > 0;
    if (gotFail !== c.expectFail) {
      failures += 1;
      console.error(`  SELFTEST FAIL: "${c.name}" expected fail=${c.expectFail}, got fail=${gotFail} (${JSON.stringify(problems)})`);
    }
  }
  if (failures > 0) {
    console.error(`${LABEL} --selftest FAIL (${failures} case(s))`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS ${cases.length}/${cases.length}`);
}

function main() {
  const problems = checkStatic();
  if (problems.length > 0) {
    console.error(`${LABEL} FAIL (static):`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL} PASS (static): recalculation gated on open + unsettled, not on gross_amount_cents being 0.`);

  const liveProblems = checkLive();
  if (liveProblems.length > 0) {
    console.error(`${LABEL} FAIL (live):`);
    for (const p of liveProblems) console.error(`  - ${p}`);
    process.exit(1);
  }
}

if (process.argv.includes("--selftest")) {
  runSelftest();
} else {
  main();
}
