#!/usr/bin/env node
/**
 * Guard: QBO A/P projector must project payload_json Line[] into accounting.bill_lines.
 *
 * Regression locked (2026-07-24): Stage 2 wrote accounting.bills headers only → Neon
 * bills≈16k / bill_lines≈1. Mirror already stores full QBO Bill JSON including Line[].
 *
 * Contract:
 *   - projectApBillLinesToLedger INSERT/UPSERT INTO accounting.bill_lines from payload_json->'Line'
 *   - incremental: ON CONFLICT + IS DISTINCT FROM; orphan DELETE via NOT EXISTS (no full wipe each tick)
 *   - does not invent a single line from header amount when Line missing
 *   - does not call GL / posting engine from the A/P puller
 *   - DescriptionOnly skipped; AccountBased + ItemBased only
 *   - sync-scheduler logs lines_projected
 *   - owner backfill script exists
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-qbo-ap-bill-lines-projection";
const failures = [];

function read(rel) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) {
    failures.push(`missing ${rel}`);
    return "";
  }
  return fs.readFileSync(p, "utf8");
}

const puller = read("apps/backend/src/qbo-sync/ap-bills-puller.ts");
const scheduler = read("apps/backend/src/qbo-sync/sync-scheduler.ts");
const backfill = read("scripts/ops/backfill-qbo-ap-bill-lines.mjs");

if (!/projectApBillLinesToLedger/.test(puller)) {
  failures.push("ap-bills-puller must export projectApBillLinesToLedger");
}
if (!/payload_json\s*->\s*'Line'|payload_json->'Line'/.test(puller)) {
  failures.push("projector must read payload_json->'Line'");
}
if (!/INSERT INTO accounting\.bill_lines/.test(puller)) {
  failures.push("projector must INSERT INTO accounting.bill_lines");
}
if (!/ON CONFLICT \(bill_id, line_sequence\)/.test(puller)) {
  failures.push("projector must upsert on (bill_id, line_sequence)");
}
if (!/IS DISTINCT FROM/.test(puller)) {
  failures.push("upsert must use IS DISTINCT FROM so identical re-runs do not thrash audit");
}
if (!/NOT EXISTS/.test(puller) || !/DELETE FROM accounting\.bill_lines/.test(puller)) {
  failures.push("projector must orphan-delete via NOT EXISTS (not leave stale QBO lines)");
}
// Forbid company-wide wipe of all QBO lines before insert (scheduler thrash / audit flood).
if (
  /DELETE FROM accounting\.bill_lines[\s\S]{0,500}source_system = 'qbo'[\s\S]{0,200}\);/.test(puller) &&
  !/DELETE FROM accounting\.bill_lines[\s\S]{0,800}NOT EXISTS/.test(puller)
) {
  failures.push("must not full-wipe QBO bill_lines each tick; require orphan NOT EXISTS delete only");
}
if (!/AccountBasedExpenseLineDetail/.test(puller) || !/ItemBasedExpenseLineDetail/.test(puller)) {
  failures.push("projector must handle AccountBased + ItemBased expense lines");
}
if (!/DescriptionOnly/.test(puller) && !/skip.*DescriptionOnly|DescriptionOnly is skipped/i.test(puller)) {
  // soft: comment or filter — money lines IN list is enough if DescriptionOnly not inserted
  if (!/IN \('AccountBasedExpenseLineDetail', 'ItemBasedExpenseLineDetail'\)/.test(puller)) {
    failures.push("projector must only insert AccountBased/ItemBased (skip DescriptionOnly)");
  }
}
if (/INSERT INTO accounting\.bill_lines[\s\S]{0,800}amount_cents/.test(puller) && /FROM accounting\.bills/.test(puller)) {
  // Heuristic: inventing one line from header amount_cents is forbidden
  if (/INSERT INTO accounting\.bill_lines[\s\S]{0,400}b\.amount_cents/.test(puller)) {
    failures.push("must not invent bill_lines amounts from header amount_cents when Line missing");
  }
}
if (/postBill|postExpense|posting-engine|postJournal|createJournalEntry/.test(puller)) {
  failures.push("A/P puller must not call GL poster during QBO projection");
}
if (!/source_system = 'qbo'/.test(puller) && !/source_system='qbo'/.test(puller)) {
  failures.push("line delete/insert must be scoped to source_system='qbo'");
}
if (!/projectApBillsToLedger\(operatingCompanyId\)/.test(scheduler) && !/projectApBillsToLedger\(/.test(scheduler)) {
  failures.push("sync-scheduler must still call projectApBillsToLedger");
}
if (!/lines_projected/.test(scheduler)) {
  failures.push("sync-scheduler must log lines_projected observability");
}
if (!/projectApBillLinesToLedger/.test(backfill)) {
  failures.push("scripts/ops/backfill-qbo-ap-bill-lines.mjs must call projectApBillLinesToLedger");
}
if (!/Owner-run|owner runs|Owner runs/i.test(backfill)) {
  failures.push("backfill script must document owner-run (not agent/prod auto)");
}

if (failures.length) {
  console.error(`${LABEL} — FAILED`);
  for (const f of failures) console.error(`- ${f}`);
  process.exit(1);
}
console.log(`${LABEL} — OK (payload_json Line[] → bill_lines, no GL invent, scheduler + backfill wired)`);
