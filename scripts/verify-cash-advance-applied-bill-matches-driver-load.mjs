#!/usr/bin/env node
/**
 * LEAD 443.113 BCF-02 — the driver bill an advance applies to must belong to the advancing driver (or its team driver),
 * be for the advance's load, and be live (not void, not settled), locked FOR UPDATE before its remaining balance is read.
 * createDriverCashAdvanceCore (apps/backend/src/cash-advances/cash-advance-create.ts) used to read only gross_amount_cents
 * and allocate against any bill id in the company — another driver's bill, a voided bill, a settled bill, unlocked.
 * The rule, on the source of the linked_driver_bill_id block:
 *   1. the driver_bills read is FOR UPDATE and selects driver_id, team_driver_id, load_id, voided_at, settled_in_settlement_id;
 *   2. it refuses by name: linked_driver_bill_voided / _settled / _driver_mismatch / _load_mismatch;
 *   3. every refusal comes BEFORE the remaining-balance read (the prior-advances SUM) — nothing allocated first.
 * --selftest plants each violation into a copy of the real source (no database).
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-cash-advance-applied-bill-matches-driver-load";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FILE = "apps/backend/src/cash-advances/cash-advance-create.ts";
const REFUSALS = ["linked_driver_bill_voided", "linked_driver_bill_settled", "linked_driver_bill_driver_mismatch", "linked_driver_bill_load_mismatch"];
const COLUMNS = ["driver_id", "team_driver_id", "load_id", "voided_at", "settled_in_settlement_id"];

function read(rel) {
  return readFileSync(join(ROOT, rel), "utf8");
}

/** The rule, pure: the errors for one cash-advance-create.ts source text. */
export function appliedBillSourceErrors(src) {
  const start = src.indexOf("if (body.linked_driver_bill_id) {");
  if (start < 0) return [`${FILE} no longer has the linked_driver_bill_id block`];
  const allocation = src.indexOf("COALESCE(SUM(amount)", start);
  if (allocation < 0) return [`${FILE}: the linked bill's remaining-balance read (prior advances SUM) is gone — re-measure this guard`];
  const block = src.slice(start, allocation);
  const errors = [];
  const read = block.match(/SELECT([\s\S]*?)FROM\s+driver_finance\.driver_bills([\s\S]*?)`/);
  if (!read) {
    errors.push(`${FILE}: the linked driver bill must be read before its remaining balance`);
  } else {
    if (!/FOR\s+UPDATE/.test(read[2])) errors.push(`${FILE}: the linked driver bill must be locked FOR UPDATE before allocation (BCF-02)`);
    for (const c of COLUMNS) {
      if (!new RegExp(`\\b${c}\\b`).test(read[1])) errors.push(`${FILE}: the linked driver bill read must select ${c}`);
    }
  }
  for (const r of REFUSALS) {
    if (!block.includes(`"${r}"`)) errors.push(`${FILE}: must refuse ${r} before the bill's remaining balance is allocated`);
  }
  return errors;
}

function liveCheck() {
  const errors = appliedBillSourceErrors(read(FILE));
  if (errors.length) {
    console.error(`${LABEL} FAILED:`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log(`${LABEL}: OK — an advance's linked bill is locked and must match driver + load + be live`);
}

function selftest() {
  const real = read(FILE);
  const unlocked = real.replace(/LIMIT 1\n(\s*)FOR UPDATE\n/, "LIMIT 1\n");
  // Move the driver check after the allocation read: the refusal no longer precedes the remainder.
  const late = real.split('"linked_driver_bill_driver_mismatch"').join('"moved"') + "\n// COALESCE(SUM(amount) \"linked_driver_bill_driver_mismatch\"";
  const cases = [
    ["the real cash-advance-create.ts passes", appliedBillSourceErrors(real).length === 0],
    ["an unlocked bill read (no FOR UPDATE) fails", unlocked !== real && appliedBillSourceErrors(unlocked).length > 0],
    ["a bill read without driver_id / team_driver_id fails", appliedBillSourceErrors(real.replace("driver_id::text AS driver_id, team_driver_id::text AS team_driver_id,", "")).length > 0],
    ["no voided refusal fails", appliedBillSourceErrors(real.split('"linked_driver_bill_voided"').join('"x"')).length > 0],
    ["no settled refusal fails", appliedBillSourceErrors(real.split('"linked_driver_bill_settled"').join('"x"')).length > 0],
    ["no load mismatch refusal fails", appliedBillSourceErrors(real.split('"linked_driver_bill_load_mismatch"').join('"x"')).length > 0],
    ["a driver refusal only after the allocation read fails", appliedBillSourceErrors(late).length > 0],
    ["a source without the linked bill block fails", appliedBillSourceErrors("export const x = 1;").length > 0],
  ];
  for (const [n, p] of cases) console.log(`  ${p ? "✓" : "✗"} ${n}`);
  const bad = cases.filter(([, p]) => !p).length;
  console.log(bad ? `${LABEL} --selftest FAIL` : `${LABEL} --selftest PASS (${cases.length}/${cases.length})`);
  process.exit(bad ? 1 : 0);
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv.includes("--selftest")) selftest();
  else liveCheck();
}
