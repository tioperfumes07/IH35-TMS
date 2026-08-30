#!/usr/bin/env node
import fs from "node:fs";

const LABEL = "verify-codex-merged-findings-not-open";
const board = fs.readFileSync("docs/audit/GUARD-WORKORDERS.md", "utf8");
const expectedDoc = JSON.parse(fs.readFileSync("docs/specs/CODEX-MERGED-FINDINGS-EXPECTED.json", "utf8"));
const expected = new Map(Object.entries(expectedDoc.findings ?? {}).map(([id, pr]) => [id, Number(pr)]));
if (!expected.size || [...expected].some(([id, pr]) => !/^(?:CUST|DRV|FLEET)-F\d+$/.test(id) || !Number.isInteger(pr))) {
  console.error(`${LABEL} FAIL — independent expected-value file is empty or malformed`);
  process.exit(1);
}

function audit(candidate) {
  const failures = [];
  for (const [id, pr] of expected) {
    const line = candidate
      .split("\n")
      .find((row) => row.startsWith(`| ${id}-`) || row.startsWith(`| ${id} |`));
    if (!line || !line.includes(`| FIXED (PR #${pr}) |`)) failures.push(`${id}=PR#${pr}`);
  }
  return failures;
}

const failures = audit(board);
if (failures.length) {
  console.error(`${LABEL} FAIL — ${failures.join(", ")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  let caught = 0;
  for (const [id, pr] of expected) {
    const mutated = board
      .replace(`| FIXED (PR #${pr}) | Codex`, `| OPEN | Codex`)
      .replace(`| ${id} | Codex | FIXED (PR #${pr}) |`, `| ${id} | Codex | OPEN |`);
    if (mutated !== board && audit(mutated).includes(`${id}=PR#${pr}`)) caught++;
  }
  if (caught !== expected.size) {
    console.error(`${LABEL} SELFTEST FAIL — ${caught}/${expected.size}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — ${caught}/${expected.size} stale-status mutations rejected`);
}

console.log(`${LABEL} PASS — ${expected.size} merged Codex findings cannot return to OPEN`);
