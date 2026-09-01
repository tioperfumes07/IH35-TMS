/**
 * Smoke: loads bulk cancel (real cancelLoadInClientTx) + settlements multi-select/reverse;
 * bulk money pre-validation lives in bulk-update.factory (ACCT-F10217 on main).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-owner-bulk-cancel-select-prevoid";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

const failures = [];
const loadsBulk = read("apps/backend/src/dispatch/loads-bulk.routes.ts");
if (!/atomicFailStopActions:\s*\[["']cancel["']\]/.test(loadsBulk)) {
  failures.push("loads-bulk must atomicFailStop cancel");
}
if (!/cancelLoadInClientTx/.test(loadsBulk)) {
  failures.push("loads-bulk cancel must call cancelLoadInClientTx");
}
if (!/actionMap:[\s\S]*cancel:/.test(loadsBulk)) {
  failures.push("loads-bulk actionMap must include cancel");
}

const cancelSvc = read("apps/backend/src/dispatch/cancellation.service.ts");
if (!/export async function cancelLoadInClientTx/.test(cancelSvc)) {
  failures.push("cancellation.service must export cancelLoadInClientTx");
}

const board = read("apps/frontend/src/pages/dispatch/DispatchBoard.tsx");
if (!/Cancel loads/.test(board) || !/action:\s*["']cancel["']/.test(board)) {
  failures.push("DispatchBoard must expose Cancel loads → bulk action cancel");
}

const setlTable = read("apps/frontend/src/pages/driver-finance/components/SettlementsTable.tsx");
if (!/selectable=\{selectable\}/.test(setlTable)) {
  failures.push("SettlementsTable must pass selectable to ParityTable");
}

const setlPage = read("apps/frontend/src/pages/driver-finance/SettlementsPage.tsx");
if (!/selectable/.test(setlPage) || !/Reverse \$\{/.test(setlPage)) {
  failures.push("SettlementsPage must enable selection + Reverse N selected");
}

const setlBulk = read("apps/backend/src/driver-finance/settlements-bulk.routes.ts");
if (!/atomicFailStopActions:\s*\[["']reverse["']\]/.test(setlBulk)) {
  failures.push("settlements-bulk must fail-stop reverse");
}
if (!/registerSettlementsBulkRoutes/.test(read("apps/backend/src/index.ts"))) {
  failures.push("index.ts must register settlements bulk routes");
}

const factory = read("apps/backend/src/bulk/bulk-update.factory.ts");
if (!/BulkPreValidationError/.test(factory) || !/bulk_pre_validation_failed/.test(factory)) {
  failures.push("bulk-update.factory must pre-validate atomicFailStop batches (ACCT-F10217)");
}

const progress = read("apps/frontend/src/components/bulk/BulkProgressDialog.tsx");
if (!/bulk-precheck-deselect-hint/.test(progress)) {
  failures.push("BulkProgressDialog must tell operator to deselect blocked rows");
}

if (failures.length) {
  console.error(`${LABEL} FAIL`);
  for (const f of failures) console.error(`- ${f}`);
  process.exit(1);
}
console.log(`${LABEL} OK`);
process.exit(0);
