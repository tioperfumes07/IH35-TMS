#!/usr/bin/env node
/**
 * LV-CLAUDEMD-S4-SETTLEMENT-LINES-HAS-LOAD-ID ratchet:
 *  Agent-facing §4 / landmine docs must NOT claim settlement_lines lacks load_id.
 *  ih35-tms-standards SKILL §4 must affirm HAS load_id.
 *
 * --selftest injects a false "no load_id" claim into the skill and expects FAIL.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SKILL = path.join(ROOT, ".claude/skills/ih35-tms-standards/SKILL.md");
const SCAN = [
  ".claude/skills/ih35-tms-standards/SKILL.md",
  "docs/blocks/HOLD-05-CHAIN-07-settlements-500-and-tieout-design.md",
  "docs/trackers/FINANCIAL-NEEDS-VERIFY-SWEEP-2026-06-25.md",
];

const FALSE_CLAIM =
  /settlement_lines[^\n]{0,120}(?:has\s+\*\*no\s+`load_id`\*\*|no\s+`load_id`|there is no settlement_lines\.load_id)/i;

function check() {
  const errors = [];
  const skill = fs.readFileSync(SKILL, "utf8");
  if (!/settlement_lines[^\n]{0,200}HAS\s+`load_id`/i.test(skill)) {
    errors.push("ih35-tms-standards §4 must affirm settlement_lines HAS `load_id`");
  }
  for (const rel of SCAN) {
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) {
      errors.push(`missing ${rel}`);
      continue;
    }
    const src = fs.readFileSync(abs, "utf8");
    if (FALSE_CLAIM.test(src)) {
      errors.push(`${rel}: still claims settlement_lines has no load_id`);
    }
  }
  return errors;
}

function main() {
  const errors = check();
  if (errors.length) {
    console.error("FAIL: verify-settlement-lines-load-id-doc");
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log("PASS: verify-settlement-lines-load-id-doc (§4 affirms HAS load_id; false claims gone)");
}

function selftest() {
  const original = fs.readFileSync(SKILL, "utf8");
  const broken = original.replace(
    /HAS\s+`load_id` nullable FK to `mdata\.loads`/,
    "has **no `load_id`** (false landmine)",
  );
  if (broken === original) {
    console.error("selftest FAIL: could not plant false claim");
    process.exit(1);
  }
  fs.writeFileSync(SKILL, broken);
  try {
    const errors = check();
    if (!errors.length) {
      console.error("selftest FAIL: expected errors after planting false claim");
      process.exit(1);
    }
    console.log("selftest PASS: planted no-load_id claim → FAIL as expected");
  } finally {
    fs.writeFileSync(SKILL, original);
  }
}

if (process.argv.includes("--selftest")) selftest();
else main();
