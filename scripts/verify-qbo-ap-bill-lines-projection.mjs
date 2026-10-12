#!/usr/bin/env node
/**
 * Guard: QBO A/P projector must project payload_json Line[] into accounting.bill_lines.
 *
 * Regression locked (2026-07-24): Stage 2 wrote accounting.bills headers only → Neon
 * bills≈16k / bill_lines≈1. Mirror already stores full QBO Bill JSON including Line[].
 *
 * ACCT-F4431380 (Lead 443.137 item 9e): the contract below is HISTORY — the projection was removed and
 * now refuses by name; see the inline OLD/NEW/WHY block. Former contract:
 *   - projectApBillLinesToLedger INSERT/UPSERT INTO accounting.bill_lines from payload_json->'Line'
 *   - incremental: ON CONFLICT + IS DISTINCT FROM; orphan VOID via NOT EXISTS (F9-02 — never hard-DELETE)
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

// ACCT-F4431380 (Lead 443.137 item 9e) — OLD: this block required the Stage 2b projector to READ
// payload_json->'Line', INSERT/UPSERT accounting.bill_lines on (bill_id, line_sequence) with IS DISTINCT FROM,
// orphan-void via NOT EXISTS + voided_at, handle AccountBased/ItemBased, stay scoped to source_system='qbo',
// and required sync-scheduler to call projectApBillsToLedger and log lines_projected.
// NEW: QuickBooks is a read-only archive — the projection was REMOVED and both entry points REFUSE BY NAME.
// The guard now requires the inverse: both exports still exist (so callers fail by name, not by import
// error), both call refuseQboNativeWrite(, the puller writes NO accounting.bills / bill_lines row at all,
// and the scheduler no longer schedules the refused projection. The void-not-delete and no-GL-poster
// checks are kept unchanged (they hold trivially and still catch a regression).
// WHY: owner ruling (USMCA = TMS ERP; TRANSP/TRK = frozen QBO mirrors); a QBO path never writes native money.
const bodyOf = (src, name) => {
  const m = new RegExp(`^export\\s+async\\s+function\\s+${name}\\b`, "m").exec(src);
  if (!m) return null;
  const end = src.indexOf("\n}\n", m.index);
  return src.slice(m.index, end === -1 ? undefined : end + 2);
};
for (const fn of ["projectApBillLinesToLedger", "projectApBillsToLedger"]) {
  const body = bodyOf(puller, fn);
  if (!body) failures.push(`ap-bills-puller must still export ${fn} (it refuses by name; callers must not get an import error)`);
  else if (!/refuseQboNativeWrite\(/.test(body)) failures.push(`${fn} must REFUSE BY NAME via refuseQboNativeWrite( (QuickBooks is a read-only archive)`);
}
if (/(?:INSERT\s+INTO|UPDATE)\s+accounting\.bill(?:s|_lines)\b/.test(puller)) {
  failures.push("ap-bills-puller must NOT write accounting.bills / accounting.bill_lines (QBO -> native projection removed)");
}
// F9-02 — orphans are voided, never hard-deleted (kept: still forbids a re-introduced hard delete).
if (/DELETE\s+FROM\s+accounting\.bill_lines/.test(puller)) {
  failures.push("projector must NOT hard-DELETE bill_lines (F9-02 void-not-delete)");
}
if (/postBill|postExpense|posting-engine|postJournal|createJournalEntry/.test(puller)) {
  failures.push("A/P puller must not call GL poster during QBO projection");
}
if (/projectApBills(?:Lines)?ToLedger\s*\(/.test(scheduler)) {
  failures.push("sync-scheduler must NOT schedule the refused projectApBillsToLedger (it would record a refused step every tick)");
}
if (!/runStep\("ap_bills_pull"/.test(scheduler)) {
  failures.push("sync-scheduler must still run the ap_bills_pull mirror step");
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
console.log(`${LABEL} — OK (ACCT-F4431380: both projections refuse by name; no native bills/bill_lines write; not scheduled; no hard-delete; no GL poster; backfill script still routes through the refusing entry point)`);
