#!/usr/bin/env node
// ROUND 288.3 item 3 (CC-1) — ADD PAYMENT IS ONE PAY LINE. The driver page's Add payment opened the Settlement Creator.
// Fails if:
//   1. the driver board's Add payment stops opening AddPayLineModal (back to the creator / runSettlement);
//   2. the form stops saving through addSettlementPayLine (the pay-line engine) or loses Save and close;
//   3. the pay-line engine stops stamping the line's GL account (driver_pay_expense role) at insert.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-driver-add-payment-line";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const F = {
  board: "apps/frontend/src/components/boards/DriverOverviewBoard.tsx",
  modal: "apps/frontend/src/components/driver-finance/AddPayLineModal.tsx",
  engine: "apps/backend/src/driver-finance/settlement-pay-line.service.ts",
};

export function problems(src) {
  const p = [];
  if (!/onClick=\{\(\) => setAddPayOpen\(true\)\}[^>]*>Add payment</.test(src.board) || !/<AddPayLineModal /.test(src.board)) p.push("the driver board's Add payment must open AddPayLineModal");
  if (/onClick=\{runSettlement\}>Add payment</.test(src.board)) p.push("Add payment opens the Settlement Creator again");
  if (!/addSettlementPayLine\(chosen,/.test(src.modal) || !/>Save and close</.test(src.modal)) p.push("the form must save through addSettlementPayLine with Save and close");
  if (!/resolveRoleAccountOptional\(client as never, input\.operatingCompanyId, "driver_pay_expense"\)/.test(src.engine) || !/posting_account_id, is_active/.test(src.engine)) p.push("the pay-line engine must stamp the driver-pay GL account at insert");
  return p;
}

export function run() {
  return problems(Object.fromEntries(Object.entries(F).map(([k, v]) => [k, readFileSync(path.join(ROOT, v), "utf8")])));
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const src = Object.fromEntries(Object.entries(F).map(([k, v]) => [k, readFileSync(path.join(ROOT, v), "utf8")]));
  const own = problems(src);
  if (process.argv.includes("--selftest")) {
    if (own.length) { console.error(`${LABEL} --selftest FAIL on the real tree — ${own.join("; ")}`); process.exit(1); }
    const plants = [
      ["back to creator", { ...src, board: src.board.replace(/onClick=\{\(\) => setAddPayOpen\(true\)\}[^>]*>Add payment</, "onClick={runSettlement}>Add payment<") }],
      ["direct insert", { ...src, modal: src.modal.replace("addSettlementPayLine(chosen,", "apiRequest(chosen,") }],
      ["no GL stamp", { ...src, engine: src.engine.replace('"driver_pay_expense")', '"x")') }],
    ];
    for (const [name, planted] of plants) {
      if (!problems(planted).length) { console.error(`${LABEL} --selftest FAIL — plant "${name}" not caught`); process.exit(1); }
    }
    console.log(`${LABEL} --selftest PASS (real tree clean; ${plants.length}/${plants.length} plants caught)`);
    process.exit(0);
  }
  if (own.length) { console.error(`${LABEL}: FAIL — ${own.join("; ")}`); process.exit(1); }
  console.log(`${LABEL}: OK — Add payment adds one pay line through the pay-line engine (settlement, load by date, driver-pay GL account).`);
}
