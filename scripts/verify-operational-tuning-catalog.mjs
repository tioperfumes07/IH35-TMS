#!/usr/bin/env node
/**
 * BLOCK-13 — Operational tuning catalog CI guard.
 * Ensures catalog exists, has ≥30 entries, all six required fields, and UI link.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CATALOG = path.join(ROOT, "docs/runbooks/operational-tuning-catalog.md");
const RUNBOOKS_UI = path.join(ROOT, "apps/frontend/src/pages/help/RunbooksIndex.tsx");
const MONITORING = path.join(ROOT, "docs/runbooks/MONITORING-PLAYBOOK.md");

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
const entries = catalog.match(/^### /gm) ?? [];
if (entries.length < 30) {
  fail(`expected ≥30 parameter entries (### headings), found ${entries.length}`);
}

for (const field of REQUIRED_FIELDS) {
  const count = (catalog.match(new RegExp(field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) ?? []).length;
  if (count < 30) {
    fail(`field "${field.trim()}" appears ${count} times; need ≥30`);
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
  if (!catalog.includes(cat)) fail(`missing category section: ${cat}`);
}

const runbooksUi = readRequired("apps/frontend/src/pages/help/RunbooksIndex.tsx");
if (!runbooksUi.includes("operational-tuning-catalog")) {
  fail("RunbooksIndex must link operational-tuning-catalog.md");
}

const monitoring = readRequired("docs/runbooks/MONITORING-PLAYBOOK.md");
if (!monitoring.includes("operational-tuning-catalog")) {
  fail("MONITORING-PLAYBOOK must link operational-tuning-catalog.md");
}

console.log(`verify:operational-tuning-catalog OK (${entries.length} entries)`);
