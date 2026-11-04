#!/usr/bin/env node
/**
 * ACCT-F11079 — POST /api/v1/driver-finance/driver-bills/:id/void-stray-practical (ACCT-F11065) had no UI.
 * Static: the driver bill detail page renders VoidStrayPracticalBillAction; the action calls the route, gates on
 * status open + not voided + no settled_in_settlement_id + miles_basis_type practical + Owner/Administrator/Accountant,
 * requires a reason of >= 20 chars, shows the server error (never swallowed), invalidates queries and toasts.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-void-stray-practical-ui-wired";
const ACTION = "apps/frontend/src/pages/driver-finance/VoidStrayPracticalBillAction.tsx";
const PAGE = "apps/frontend/src/pages/driver-finance/DriverBillDetailPage.tsx";

export function findDefects(action, page) {
  const out = [];
  if (!/driver-finance\/driver-bills\/\$\{encodeURIComponent\(billId\)\}\/void-stray-practical/.test(action)) out.push("the action does not call the void-stray-practical route");
  if (!/method:\s*"POST"/.test(action)) out.push("the call is not a POST");
  const g = action.match(/export function canVoidStrayPractical[\s\S]*?\n}\n/)?.[0] ?? "";
  if (!g) out.push("canVoidStrayPractical not found");
  if (!/=== "open"/.test(g)) out.push("gate: status open missing");
  if (!/!bill\.voided_at/.test(g)) out.push("gate: not-voided missing");
  if (!/!bill\.settled_in_settlement_id/.test(g)) out.push("gate: unsettled missing");
  if (!/miles_basis_type === "practical"/.test(g)) out.push("gate: practical basis missing");
  if (!/VOID_STRAY_PRACTICAL_ROLES/.test(g) || !/"Owner", "Administrator", "Accountant"/.test(action)) out.push("gate: Owner/Administrator/Accountant role missing");
  if (!/if \(!canVoidStrayPractical\(bill, role\)\) return null/.test(action)) out.push("the component renders without the gate");
  if (!/VOID_STRAY_PRACTICAL_MIN_REASON = 20/.test(action)) out.push("minimum reason is not 20");
  if (!/disabled=\{!reasonIsValid\(reason\)\}/.test(action)) out.push("confirm is not disabled for a short reason");
  if (!/useState\(""\)/.test(action)) out.push("reason is prefilled");
  if (!/onError:[^\n]*setServerError\(userFacingApiError/.test(action) || !/\{serverError \?/.test(action)) out.push("the server error is not shown in the modal");
  if (!/invalidateQueries/.test(action)) out.push("queries are not invalidated on success");
  if (!/pushToast\(/.test(action)) out.push("no toast on success");
  if (!/<Modal /.test(action)) out.push("not using the shared Modal");
  if (!/<VoidStrayPracticalBillAction/.test(page)) out.push("the driver bill detail page does not render the action");
  return out;
}

const action = readFileSync(path.join(ROOT, ACTION), "utf8");
const page = readFileSync(path.join(ROOT, PAGE), "utf8");
if (process.argv.includes("--selftest")) {
  const plants = [
    ["route not called", [action.replaceAll("/void-stray-practical", "/void-x"), page]],
    ["status gate dropped", [action.replace('=== "open"', '!== ""'), page]],
    ["voided gate dropped", [action.replace("!bill.voided_at &&", ""), page]],
    ["settled gate dropped", [action.replace("!bill.settled_in_settlement_id &&", ""), page]],
    ["practical gate dropped", [action.replace('bill.miles_basis_type === "practical"', "true"), page]],
    ["role dropped", [action.replace('"Owner", "Administrator", "Accountant"', '"Owner", "Administrator"'), page]],
    ["ungated render", [action.replace("if (!canVoidStrayPractical(bill, role)) return null", ""), page]],
    ["reason min 5", [action.replace("MIN_REASON = 20", "MIN_REASON = 5"), page]],
    ["confirm not disabled", [action.replace("disabled={!reasonIsValid(reason)}", ""), page]],
    ["prefilled reason", [action.replace('useState("")', 'useState("x")'), page]],
    ["server error swallowed", [action.replace("{serverError ?", "{false ?"), page]],
    ["no invalidate", [action.replace(/invalidateQueries/g, "noop"), page]],
    ["no toast", [action.replace("pushToast(", "noop("), page]],
    ["page does not render action", [action, page.replace("<VoidStrayPracticalBillAction", "<span")]],
  ];
  let caught = 0;
  for (const [name, [a, p]] of plants) {
    const hit = (a !== action || p !== page) && findDefects(a, p).length > 0;
    console.log(`${hit ? "ok  " : "MISS"}  plant: ${name}`);
    if (hit) caught++;
  }
  console.log(`${LABEL} SELFTEST: ${caught}/${plants.length} planted defects caught`);
  process.exit(caught === plants.length ? 0 : 1);
}
const d = findDefects(action, page);
if (d.length) { console.error(`${LABEL} FAIL:\n - ${d.join("\n - ")}`); process.exit(1); }
console.log(`${LABEL} PASS — the driver bill page offers Void practical-miles bill, gated on 4 conditions + role, reason >= 20, server error shown`);
