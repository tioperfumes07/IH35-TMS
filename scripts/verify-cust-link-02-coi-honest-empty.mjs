#!/usr/bin/env node
/**
 * CUST-LINK-02 — COI Requests tab must show honest empty copy when
 * insurance.coi_request has 0 rows (not a silent blank panel).
 *
 * Live Neon 2026-08-03 (bypass_rls=lucia, br-fancy-credit-akjnd07a):
 *   count(*)=0 AND n_live_tup=0 — legitimately empty.
 *
 *   node scripts/verify-cust-link-02-coi-honest-empty.mjs
 *   node scripts/verify-cust-link-02-coi-honest-empty.mjs --selftest
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SELFTEST = process.argv.includes("--selftest");
const LABEL = "verify-cust-link-02-coi-honest-empty";
const FILE = "apps/frontend/src/pages/customers/CoiTab.tsx";

function assert(src) {
  const problems = [];
  if (!/emptyText=/.test(src)) {
    problems.push(`${FILE}: ParityTable/list must set emptyText`);
  }
  if (!/No COI requests yet/.test(src)) {
    problems.push(`${FILE}: emptyText must say "No COI requests yet" (honest empty)`);
  }
  // Must not use a silent "" empty or hide the table with no message.
  if (/emptyText=\{?\s*["']\s*["']\s*\}?/.test(src)) {
    problems.push(`${FILE}: emptyText must not be blank`);
  }
  if (!/\+ Create COI/.test(src)) {
    problems.push(`${FILE}: empty state surface must still offer + Create COI`);
  }
  return problems;
}

const src = readFileSync(path.join(ROOT, FILE), "utf8");

if (SELFTEST) {
  const planted = src.replace(/No COI requests yet[^"]*/g, "");
  const caught = assert(planted);
  if (!caught.length) {
    console.error(`${LABEL} SELFTEST FAIL — planted blank empty not caught`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS`);
  process.exit(0);
}

const problems = assert(src);
if (problems.length) {
  console.error(`${LABEL} FAIL:`);
  for (const p of problems) console.error("  - " + p);
  process.exit(1);
}
console.log(
  `${LABEL}: OK — CoiTab honest emptyText locked (Neon lucia count insurance.coi_request=0 / n_live_tup=0)`,
);
process.exit(0);
