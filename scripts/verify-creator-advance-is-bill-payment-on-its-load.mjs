#!/usr/bin/env node
// Owner 9:44 / 9:46 PM CT 2026-10-10 + Lead ruling (Option 1): a Settlement Creator advance is a BILL PAYMENT on the driver
// bill of the load the driver was on THE DAY OF THE ADVANCE (the existing B5 path, createDriverCashAdvanceCore
// linked_driver_bill_id), disbursed at post Dr the driver's own advance sub-account / Cr the cash-clearing role account
// (not a bank, not A/P), cleared to the bank by the owner's manual Banking match. Static checks; --selftest plants each.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const LABEL = "verify-creator-advance-is-bill-payment-on-its-load";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CREATOR = "apps/backend/src/driver-finance/settlement-creator.service.ts";
const CORE = "apps/backend/src/cash-advances/cash-advance-create.ts";
export function check(creator, core) {
  const f = [];
  if (!/loadNumberOnAdvanceDay\(draft\.loads \?\? \[\], day\)/.test(creator)) f.push(`${CREATOR}: the advance's load must be the one the driver was on that day`);
  if (!/linked_driver_bill_id: advanceBillId,/.test(creator)) f.push(`${CREATOR}: the advance must be applied to that load's driver bill`);
  if (!/FROM driver_finance\.driver_bills[\s\S]{0,200}load_id = \$2::uuid AND driver_id = \$3::uuid/.test(creator)) f.push(`${CREATOR}: the driver bill must be resolved by load + driver`);
  if (!/return body\.linked_driver_bill_id \? "driver_settlement"/.test(core)) f.push(`${CORE}: a bill-linked advance must be recoverable driver debt`);
  if (!/resolveRoleAccount\(client as never, companyId, "cash_clearing"\)/.test(core)) f.push(`${CORE}: a historical bill-payment advance must credit the cash-clearing role account`);
  if (/companyId, "ap_control"\)/.test(core)) f.push(`${CORE}: the advance must never credit A/P`);
  return f;
}
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
if (process.argv.includes("--selftest")) {
  const c = read(CREATOR), k = read(CORE); const fails = [];
  if (check(c, k).length) fails.push(`tree not clean: ${check(c, k).join("; ")}`);
  const plants = [
    ["no bill link", c.replace("linked_driver_bill_id: advanceBillId,", "linked_driver_bill_id: null,"), k],
    ["load from row", c.replace("loadNumberOnAdvanceDay(draft.loads ?? [], day)", "null"), k],
    ["load_expense routing", c, k.replace('return body.linked_driver_bill_id ? "driver_settlement"', 'return false ? "driver_settlement"')],
    ["credits A/P", c, k.replace('resolveRoleAccount(client as never, companyId, "cash_clearing")', 'resolveRoleAccount(client as never, companyId, "ap_control")')],
  ];
  for (const [n, a, b] of plants) if (check(a, b).length === 0) fails.push(`plant escaped: ${n}`);
  if (fails.length) { console.error(`${LABEL} --selftest FAIL: ${fails.join("; ")}`); process.exit(1); }
  console.log(`${LABEL} --selftest PASS ${plants.length}/${plants.length}`); process.exit(0);
}
const fails = check(read(CREATOR), read(CORE));
if (fails.length) { console.error(`${LABEL}: FAIL\n  ${fails.join("\n  ")}`); process.exit(1); }
console.log(`${LABEL}: PASS — advance = bill payment on the load of its day; disbursed Dr driver advance / Cr cash clearing; never A/P, never a bank at post`);
