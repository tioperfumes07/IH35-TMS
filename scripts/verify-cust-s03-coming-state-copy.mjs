#!/usr/bin/env node
/**
 * CUST-S03 — nine follow-up Customer tabs must render honest COMING_STATE_COPY
 * (named data-source gap), never a silent empty table.
 *
 *   node scripts/verify-cust-s03-coming-state-copy.mjs
 *   node scripts/verify-cust-s03-coming-state-copy.mjs --selftest
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SELFTEST = process.argv.includes("--selftest");
const LABEL = "verify-cust-s03-coming-state-copy";
const FILE = "apps/frontend/src/pages/Customers.tsx";

const REQUIRED = [
  "activity_feed",
  "statements",
  "recurring_transactions",
  "projects",
  "late_fees",
  "notes",
  "tasks",
  "opportunities",
  "conversations",
];

function assert(src) {
  const problems = [];
  if (!/const COMING_STATE_COPY/.test(src)) {
    problems.push(`${FILE}: missing COMING_STATE_COPY map`);
  }
  if (!/function CustomerTabComingState/.test(src)) {
    problems.push(`${FILE}: missing CustomerTabComingState renderer`);
  }
  for (const key of REQUIRED) {
    if (!new RegExp(`${key}\\s*:`).test(src)) {
      problems.push(`${FILE}: COMING_STATE_COPY missing key ${key}`);
    }
  }
  // Each copy must name the missing source / follow-up — not silent empty.
  const block = src.match(/const COMING_STATE_COPY[\s\S]*?^};/m);
  if (block) {
    for (const key of REQUIRED) {
      const m = block[0].match(new RegExp(`${key}:\\s*"([^"]+)"`));
      if (!m || m[1].trim().length < 24) {
        problems.push(`${FILE}: ${key} copy too short / missing`);
      } else if (!/follow-up|needs a|flagged/i.test(m[1])) {
        problems.push(`${FILE}: ${key} copy must honestly name the gap (follow-up / needs a …)`);
      }
    }
  }
  if (!/CustomerTabComingState/.test(src) || !/COMING_STATE_COPY\[tab\]/.test(src)) {
    problems.push(`${FILE}: coming tabs must render COMING_STATE_COPY[tab]`);
  }
  return problems;
}

const src = readFileSync(path.join(ROOT, FILE), "utf8");

if (SELFTEST) {
  const planted = src.replace(/activity_feed:\s*"[^"]+"/, 'activity_feed: ""');
  const caught = assert(planted);
  if (!caught.length) {
    console.error(`${LABEL} SELFTEST FAIL — planted empty copy not caught`);
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
console.log(`${LABEL}: OK — 9 Customer follow-up tabs have honest COMING_STATE_COPY`);
process.exit(0);
