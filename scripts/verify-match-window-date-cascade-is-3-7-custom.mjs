#!/usr/bin/env node
/**
 * ROUND 156 §2 / ROUND 157-C PR1 — date cascade is exactly 3→7→From/To.
 * Alias-named per master-spec guard list. Delegates structural checks to the
 * settlement-born cascade assertions in match.service.ts.
 *
 * Usage: node scripts/verify-match-window-date-cascade-is-3-7-custom.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SERVICE = "apps/backend/src/accounting/bank-recon/match.service.ts";
const LABEL = "verify-match-window-date-cascade-is-3-7-custom";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

export function problemsFor(service) {
  const p = [];
  if (!/export const MATCH_WINDOW_STEPS = \{[\s\S]*?step1:\s*\{\s*before:\s*3,\s*after:\s*1\s*\}[\s\S]*?step2:\s*\{\s*before:\s*7,\s*after:\s*2\s*\}/.test(service)) {
    p.push("MATCH_WINDOW_STEPS must be step1 {3,1} and step2 {7,2}");
  }
  if (/export const QBO_DAYS_BEFORE\s*=\s*90|export const QBO_DAYS_AFTER\s*=\s*20/.test(service)) {
    p.push("QBO 90/20 must stay retired");
  }
  if (!/No candidates within 3 days — widened to 7 days|auto_widened:\s*true/.test(service)) {
    // auto_widened true is enough for the service; banner text lives in FE
    if (!/auto_widened:\s*true/.test(service)) p.push("Step1 zero must auto_widen to Step2");
  }
  if (!/Never auto-advance past Step 2|never past Step 2|Never advances past Step 2/i.test(service)) {
    if (/step:\s*3/.test(service) && /auto_widened/.test(service)) p.push("must never auto-advance past step 2");
  }
  if (!/hasExplicitDates/.test(service)) p.push("explicit From/To must bypass cascade");
  // Custom From/To — no cap (normalize invert only)
  if (/function clampCustomSpan[\s\S]{0,500}MAX_CUSTOM_SPAN_DAYS/.test(service)) {
    p.push("custom From/To must not truncate via MAX_CUSTOM_SPAN_DAYS");
  }
  if (!/toMs < fromMs/.test(service) && !/toMs < fromMs/.test(service)) {
    // inverted-range normalize
    if (!/if \(toMs < fromMs\)/.test(service)) {
      p.push("clampCustomSpan should normalize inverted From/To");
    }
  }
  return p;
}

if (process.argv.includes("--selftest")) {
  const ok = read(SERVICE);
  if (problemsFor(ok).length) {
    console.error("baseline FAIL", problemsFor(ok));
    process.exit(1);
  }
  const bad = ok.replace("step1: { before: 3, after: 1 }", "step1: { before: 30, after: 7 }");
  if (!problemsFor(bad).length) {
    console.error("mutant did not fail");
    process.exit(1);
  }
  console.log(`${LABEL} --selftest OK`);
  process.exit(0);
}

const problems = problemsFor(read(SERVICE));
if (problems.length) {
  console.error(`${LABEL} FAIL:`);
  for (const x of problems) console.error(`  - ${x}`);
  process.exit(1);
}
console.log(`${LABEL} PASS`);
