#!/usr/bin/env node
/** CLOSURE-17 CI guard — ON-HOLD triage decision docs must exist. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-closure-17-on-hold-triage";

const REQUIRED = [
  "docs/decisions/ON-HOLD-TRIAGE-2026-06-05.md",
  "docs/decisions/A23-11-decision.md",
  "docs/decisions/A23-14-decision.md",
  "docs/decisions/B19-decision.md",
  "docs/decisions/B20-decision.md",
  ".block-ready/CLOSURE-17-ON-HOLD-TRIAGE.json",
];

const DECISION_MARKERS = [
  ["A23-11-decision.md", "Recommendation:"],
  ["A23-14-decision.md", "Recommendation:"],
  ["B19-decision.md", "Recommendation:"],
  ["B20-decision.md", "Recommendation:"],
  ["ON-HOLD-TRIAGE-2026-06-05.md", "| A23-11 |"],
];

function main() {
  for (const rel of REQUIRED) {
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) {
      console.error(`[${LABEL}] FAIL missing ${rel}`);
      process.exit(1);
    }
  }
  for (const [file, marker] of DECISION_MARKERS) {
    const text = fs.readFileSync(path.join(ROOT, "docs/decisions", file), "utf8");
    if (!text.includes(marker)) {
      console.error(`[${LABEL}] FAIL ${file} missing "${marker}"`);
      process.exit(1);
    }
  }
  console.log(`[${LABEL}] PASS (${REQUIRED.length} artifacts)`);
}

main();
