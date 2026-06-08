#!/usr/bin/env node
/**
 * CLOSURE-16-DEEP-AUDIT-C — Load → Invoice → Factored workflow static guard.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "deep-audit-c-workflow-load-to-invoice-to-factored";

function fail(message) {
  console.error(`[${LABEL}] FAIL: ${message}`);
  process.exit(1);
}

function read(rel) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) fail(`missing file: ${rel}`);
  return fs.readFileSync(abs, "utf8");
}

const manifest = read("apps/frontend/src/routes/manifest.tsx");
const teamSplits = read("apps/backend/src/migrations/0394-team-splits.sql");
const audit = read("docs/audits/DEEP-AUDIT-C-E2E-WORKFLOWS.md");

if (!manifest.includes("/factoring/faro-import")) fail("Faro import route required");
if (!manifest.includes("/accounting/payments")) fail("Receive Payment route required");
if (!teamSplits.includes("team_split_configs")) fail("team_splits migration required for split settlement check");
if (!audit.includes("Workflow 2")) fail("audit doc must document Workflow 2");
if (!audit.includes("C-WF2-1")) fail("audit must record team-split HIGH finding");

console.log(`[${LABEL}] PASS`);
