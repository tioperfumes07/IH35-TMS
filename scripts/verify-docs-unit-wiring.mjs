#!/usr/bin/env node
/** @matrix-built {"modules":["docs"],"cols":["unit"],"leafRe":"^(home|tab\\.(all|unit|equipment)|upload|table\\.entity_link)$","task":"LINK-F5167-DOCS-UNIT-WIRING"} */
/**
 * OWNER-EXECUTION-PLAN vertical unit-column sweep (2026-08-14): 6 genuine docs leaves, all sharing
 * DocsHomePage.tsx — a real docsLinkToEntityKind() (entity_type "unit"/"equipment" -> EntityLink
 * kind="unit"), a real "Units" tab in ENTITY_TABS, and a real defaultLinkEntityType passed to
 * UploadModal when the unit tab is active.
 *
 * Self-test: node scripts/verify-docs-unit-wiring.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE = "apps/frontend/src/pages/docs/DocsHomePage.tsx";
const LABEL = "verify-docs-unit-wiring";

const PATTERNS = [
  /case "unit":\s*\n\s*case "load":\s*\n\s*case "settlement":\s*\n\s*case "invoice":\s*\n\s*return entityType;/,
  /case "equipment":\s*\n\s*return "unit";/,
  /\{ id: "unit", label: "Units" \}/,
  /\{ id: "equipment", label: "Equipment" \}/,
  /const kind = docsLinkToEntityKind\(link\.entity_type\);/,
  /activeTab === "driver" \|\| activeTab === "customer" \|\| activeTab === "vendor" \|\| activeTab === "unit"/,
];

export function audit(src) {
  const failures = [];
  const content = src[FILE] || "";
  for (const pattern of PATTERNS) {
    if (!pattern.test(content)) failures.push(`${FILE}: missing real unit entity-kind wiring (${pattern})`);
  }
  return failures;
}

function loadSrc(root) {
  return { [FILE]: fs.readFileSync(path.join(root, FILE), "utf8") };
}

if (process.argv.includes("--selftest")) {
  const good = loadSrc(ROOT);
  if (audit(good).length) {
    console.error(`${LABEL} SELFTEST FAIL — real repo state rejected:\n- ${audit(good).join("\n- ")}`);
    process.exit(1);
  }
  let caught = 0;
  for (const pattern of PATTERNS) {
    const mutated = { [FILE]: good[FILE].replace(new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g"), "REMOVED") };
    if (mutated[FILE] === good[FILE]) {
      console.error(`${LABEL} SELFTEST FAIL — pattern did not match source, re-anchor: ${pattern}`);
      process.exit(1);
    }
    if (audit(mutated).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — mutation escaped: ${pattern}`);
      process.exit(1);
    }
    caught++;
  }
  console.log(`${LABEL} SELFTEST PASS — ${caught} mutations detected`);
  process.exit(0);
}

const failures = audit(loadSrc(ROOT));
if (failures.length) {
  console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — docs' 6 unit-scoped home/tab/upload/entity-link leaves are real`);
