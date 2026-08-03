#!/usr/bin/env node
/**
 * GUARD 2180 — Safety fines EntityLinks must not use UUID-slice labels.
 * Prefer related_unit_number / related_load_number when present; otherwise stable words.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-safety-fines-entitylink-labels";
const TARGETS = [
  "apps/frontend/src/pages/safety/InternalFinesPage.tsx",
  "apps/frontend/src/pages/safety/components/FineDetailDrawer.tsx",
  "apps/frontend/src/pages/safety/components/FinePaymentLinkBanner.tsx",
];

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function assert(sources) {
  const problems = [];
  for (const rel of TARGETS) {
    const src = sources?.[rel] ?? read(rel);
    if (/\.slice\(0,\s*8\)/.test(src)) {
      problems.push(`${rel}: UUID-slice EntityLink label is forbidden`);
    }
  }
  return problems;
}

if (process.argv.includes("--selftest")) {
  const live = Object.fromEntries(TARGETS.map((t) => [t, read(t)]));
  const liveProblems = assert(live);
  if (liveProblems.length) {
    console.error(`${LABEL} SELFTEST FAIL live:`, liveProblems);
    process.exit(1);
  }
  const planted = assert({
    ...live,
    [TARGETS[0]]: live[TARGETS[0]] + "\nlabel={String(x).slice(0, 8)}\n",
  });
  if (!planted.some((p) => p.includes("UUID-slice"))) {
    console.error(`${LABEL} SELFTEST FAIL: planted slice not caught`, planted);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS`);
  process.exit(0);
}

const problems = assert();
if (problems.length) {
  console.error(`${LABEL} FAIL:`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — fines EntityLinks forbid UUID-slice labels`);
