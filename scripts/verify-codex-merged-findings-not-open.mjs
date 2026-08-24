#!/usr/bin/env node
import fs from "node:fs";

const LABEL = "verify-codex-merged-findings-not-open";
const board = fs.readFileSync("docs/audit/GUARD-WORKORDERS.md", "utf8");
const expected = new Map([
  ["CUST-F6040", 14591], ["DRV-F6041", 14592], ["DRV-F6042", 14593], ["DRV-F6043", 14595],
  ["DRV-F6044", 14596], ["DRV-F6045", 14597], ["FLEET-F6046", 14598], ["FLEET-F6047", 14600],
  ["FLEET-F6048", 14602], ["FLEET-F6049", 14604], ["FLEET-F6050", 14607], ["FLEET-F6051", 14608], ["DRV-F6052", 14610],
  ["DRV-F6053", 14611], ["CUST-F6054", 14613], ["CUST-F6055", 14614], ["CUST-F6056", 14615],
  ["CUST-F6057", 14616], ["CUST-F6058", 14617], ["FLEET-F6059", 14618], ["CUST-F6060", 14620],
  ["CUST-F6061", 14622], ["FLEET-F6062", 14625], ["DRV-F6063", 14627], ["DRV-F6064", 14631],
  ["DRV-F6065", 14633], ["DRV-F6066", 14634], ["CUST-F6067", 14636], ["DRV-F6068", 14637],
  ["FLEET-F6069", 14639], ["FLEET-F6070", 14640], ["DRV-F6071", 14643],
]);

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
