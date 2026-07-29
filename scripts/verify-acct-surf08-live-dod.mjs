#!/usr/bin/env node
/**
 * ACCT-SURF-08 live DoD ratchet — scoreboard must stay PASS with named browser + Neon evidence.
 * Cursor even claim: verify-step 1764.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST = path.join(ROOT, "docs/module-completion/accounting.json");
const STRUCT = path.join(ROOT, "scripts/verify-acct-surf-08-period-audit.mjs");
const failures = [];

if (!fs.existsSync(STRUCT)) failures.push("missing structural guard scripts/verify-acct-surf-08-period-audit.mjs");

const data = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
const item = (data.items || []).find((i) => i.id === "ACCT-SURF-08");
if (!item) failures.push("ACCT-SURF-08 missing from accounting.json");
else {
  if (item.status !== "PASS") failures.push(`ACCT-SURF-08 status must be PASS (got ${item.status})`);
  const blob = `${item.evidence || ""}\n${item.live_proof || ""}`;
  for (const needle of [
    "month-close",
    "audit-trail",
    "posting-lineage",
    "Neon",
    "journal_entry_postings",
    "TRANSP",
  ]) {
    if (!blob.includes(needle)) failures.push(`ACCT-SURF-08 evidence/live_proof missing required marker: ${needle}`);
  }
  if (!/USMCA/.test(blob)) failures.push("ACCT-SURF-08 evidence must cite USMCA posting density (Neon) even if browser was TRANSP-first");
}

if (failures.length) {
  console.error("verify-acct-surf08-live-dod: FAIL");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("verify-acct-surf08-live-dod: OK — ACCT-SURF-08 PASS with browser+Neon evidence contract");
