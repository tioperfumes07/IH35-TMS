#!/usr/bin/env node
/**
 * BLOCK-13 — Operational tuning catalog CI guard.
 * Ensures catalog exists, has ≥30 entries, all six required fields, and UI link.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REQUIRED_FIELDS = [
  "- Current value:",
  "- Location:",
  "- Why this value:",
  "- How to change:",
  "- Impact of changing:",
  "- Last changed:",
];

function fail(msg) {
  console.error(`verify:operational-tuning-catalog FAIL: ${msg}`);
  process.exit(1);
}

function readRequired(rel) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) fail(`missing ${rel}`);
  return fs.readFileSync(abs, "utf8");
}

const catalog = readRequired("docs/runbooks/operational-tuning-catalog.md");
const entryBlocks = catalog
  .split(/^### /m)
  .slice(1)
  .map((chunk) => `### ${chunk}`);

if (entryBlocks.length < 30) {
  fail(`expected ≥30 parameter entries (### headings), found ${entryBlocks.length}`);
}

for (const [index, block] of entryBlocks.entries()) {
  const title = block.split("\n")[0]?.replace(/^###\s*/, "").trim() || `entry_${index + 1}`;
  for (const field of REQUIRED_FIELDS) {
    if (!block.includes(field)) {
      fail(`entry "${title}" is missing field "${field}"`);
    }
  }
}

const categories = [
  "Cron schedules",
  "Rate limits",
  "Retry counts",
  "Timeouts",
  "Cache TTLs",
  "Batch sizes",
  "Reconciliation thresholds",
  "Alert thresholds",
];
for (const cat of categories) {
  if (!catalog.includes(`## ${cat}`)) fail(`missing category section: ${cat}`);
}

const runbooksUi = readRequired("apps/frontend/src/pages/help/RunbooksIndex.tsx");
if (!runbooksUi.includes("operational-tuning-catalog")) {
  fail("RunbooksIndex must link operational-tuning-catalog.md");
}

const monitoring = readRequired("docs/runbooks/MONITORING-PLAYBOOK.md");
if (!monitoring.includes("operational-tuning-catalog")) {
  fail("MONITORING-PLAYBOOK must link operational-tuning-catalog.md");
}

console.log(`verify:operational-tuning-catalog OK (${entryBlocks.length} entries)`);
