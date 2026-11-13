#!/usr/bin/env node
/**
 * ENG-44 REVERSE — POST /api/v1/driver-finance/driver-bills/:id/reinstate has a UI.
 * Static: the driver bill detail page renders ReinstateBillAction; the action calls the route,
 * gates on status=void + voided_at + no settled_in_settlement_id + Owner/Administrator/Accountant,
 * requires a reason >= 20 chars, shows the server error, invalidates queries and toasts.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-reinstate-driver-bill-ui-wired";
const ACTION = "apps/frontend/src/pages/driver-finance/ReinstateBillAction.tsx";
const PAGE = "apps/frontend/src/pages/driver-finance/DriverBillDetailPage.tsx";

export function findDefects(action, page) {
  const out = [];
  if (!/\/driver-bills\/\$\{encodeURIComponent\(billId\)\}\/reinstate[`'"]/.test(action)) out.push("the action does not call the reinstate route");
  if (!/method:\s*"POST"/.test(action)) out.push("the call is not a POST");
  if (!/canReinstateBill/.test(action)) out.push("canReinstateBill not found");
  if (!/"void"/.test(action)) out.push("gate: status void missing");
  if (!/voided_at/.test(action)) out.push("gate: voided_at check missing");
  if (!/!bill\.settled_in_settlement_id/.test(action)) out.push("gate: unsettled missing");
  if (!/REINSTATE_BILL_ROLES/.test(action) || !/"Owner", "Administrator", "Accountant"/.test(action)) out.push("gate: Owner/Administrator/Accountant role missing");
  if (!/canReinstateBill\(bill, role\)/.test(action)) out.push("the component renders without the gate");
  if (!/REINSTATE_BILL_MIN_REASON = 20/.test(action)) out.push("minimum reason is not 20");
  if (!/<VoidReasonModal\b/.test(action) || !/import \{ VoidReasonModal \}/.test(action)) out.push("the reason does not come from VoidReasonModal");
  if (!/minLength=\{REINSTATE_BILL_MIN_REASON\}/.test(action)) out.push("VoidReasonModal is not given the 20-char minimum");
  if (/<textarea\b|<input\b/.test(action)) out.push("inline reason input (must route through VoidReasonModal)");
  if (!/onSubmit=\{async \(reason\) =>/.test(action) || !/mutateAsync\(reason\)/.test(action)) out.push("the dialog submit does not call the reinstate mutation with the picked reason");
  if (!/catch \(error\)[\s\S]{0,200}throw new Error\(userFacingApiError\(error/.test(action)) out.push("the server error is not rethrown into the dialog");
  if (!/invalidateQueries/.test(action)) out.push("queries are not invalidated on success");
  if (!/pushToast\(/.test(action)) out.push("no toast on success");
  if (!/<ReinstateBillAction/.test(page)) out.push("the driver bill detail page does not render ReinstateBillAction");
  return out;
}

const action = readFileSync(path.join(ROOT, ACTION), "utf8");
const page = readFileSync(path.join(ROOT, PAGE), "utf8");

if (process.argv.includes("--selftest")) {
  const plants = [
    ["route not called", [action.replace("/reinstate`", "/reinstate-not`"), page]],
    ["status gate dropped", [action.replace('=== "void"', '!== ""'), page]],
    ["settled gate dropped", [action.replace("!bill.settled_in_settlement_id", "true"), page]],
    ["role dropped", [action.replace('"Owner", "Administrator", "Accountant"', '"Owner", "Administrator"'), page]],
    ["ungated render", [action.replace("if (!canReinstateBill(bill, role)) return null", ""), page]],
    ["reason min 5", [action.replace("MIN_REASON = 20", "MIN_REASON = 5"), page]],
    ["min length dropped", [action.replace("minLength={REINSTATE_BILL_MIN_REASON}", ""), page]],
    ["server error swallowed", [action.replace("throw new Error(userFacingApiError(error", "void (userFacingApiError(error"), page]],
    ["no invalidate", [action.replace(/invalidateQueries/g, "noop"), page]],
    ["page does not mount", [action, page.replace(/<ReinstateBillAction/, "<!-- removed -->")]],
  ];
  let ok = 0;
  for (const [name, [a, p]] of plants) {
    const defects = findDefects(a, p);
    if (defects.length === 0) {
      console.error(`SELFTEST FAIL (plant undetected): ${name}`);
      process.exit(1);
    }
    ok++;
  }
  const clean = findDefects(action, page);
  if (clean.length > 0) {
    console.error(`SELFTEST FAIL (false positive on clean files): ${clean.join("; ")}`);
    process.exit(1);
  }
  console.log(`${LABEL}: selftest OK (${ok} plants detected, clean files pass)`);
  process.exit(0);
}

const defects = findDefects(action, page);
if (defects.length > 0) {
  console.error(`FAIL ${LABEL}: ${defects.join("; ")}`);
  process.exit(1);
}
console.log(`PASS ${LABEL}`);
