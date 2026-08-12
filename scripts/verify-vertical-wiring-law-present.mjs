#!/usr/bin/env node
/**
 * verify-vertical-wiring-law-present.mjs — LAW-2026-08-12-VERTICAL-WIRING.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-vertical-wiring-law-present";
const LAW = "docs/lockdown/VERTICAL-WIRING-LAW-2026-08-12.md";
const MUST_CITE = [
  "docs/lockdown/WIRE-FIRST-SPRINT-LAW-2026-08-12.md",
  "docs/specs/CODER-PASTE-INSTRUCTIONS-2026-08-12.md",
  "docs/specs/STANDING-SESSION-DIRECTIVE.md",
];
const VERTICAL_MARK =
  /VERTICAL-WIRING-LAW-2026-08-12|column-wave|CLASS-SWEEP|one matrix COLUMN ID|column id × all/i;

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

export function findMissing() {
  const missing = [];
  if (!fs.existsSync(path.join(ROOT, LAW))) missing.push(`${LAW} (missing file)`);
  for (const rel of MUST_CITE) {
    if (!fs.existsSync(path.join(ROOT, rel))) {
      missing.push(`${rel} (missing file)`);
      continue;
    }
    if (!VERTICAL_MARK.test(read(rel))) missing.push(`${rel} (does not cite vertical wiring law)`);
  }
  if (!read("docs/law/LAW.json").includes("LAW-2026-08-12-VERTICAL-WIRING")) {
    missing.push("docs/law/LAW.json (LAW-2026-08-12-VERTICAL-WIRING not registered)");
  }
  return missing;
}

function selftest() {
  if (!VERTICAL_MARK.test("docs/lockdown/VERTICAL-WIRING-LAW-2026-08-12.md")) {
    console.error(`${LABEL} SELFTEST FAIL`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS`);
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes("--selftest")) process.exit(selftest());
  const missing = findMissing();
  if (missing.length) {
    console.error(`${LABEL} FAIL:\n`);
    for (const m of missing) console.error(`  - ${m}`);
    process.exit(1);
  }
  console.log(`${LABEL} OK — vertical wiring law present and cited`);
}
