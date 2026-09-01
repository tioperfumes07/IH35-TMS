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
// Change 3 (Cascade Void APPROVED): UI verb is Void; engine action remains cancel.
if (!/label:\s*["']Void["']/.test(board) || !/action:\s*["']cancel["']/.test(board)) {
  failures.push("DispatchBoard must expose Void → bulk action cancel");
}
if (/label:\s*["']Cancel loads["']/.test(board)) {
  failures.push("DispatchBoard must not label bulk cancel as Cancel loads (one verb: Void)");
}

const setlTable = read("apps/frontend/src/pages/driver-finance/components/SettlementsTable.tsx");
if (!/selectable=\{selectable\}/.test(setlTable)) {
  failures.push("SettlementsTable must pass selectable to ParityTable");
}

const setlPage = read("apps/frontend/src/pages/driver-finance/SettlementsPage.tsx");
if (!/selectable/.test(setlPage) || !/Void \$\{/.test(setlPage)) {
  failures.push("SettlementsPage must enable selection + Void N selected");
}
if (/Reverse \$\{/.test(setlPage) || /title="Reverse settlements"/.test(setlPage)) {
  failures.push("SettlementsPage must not use Reverse verb in UI (one verb: Void)");
}
if (
  !/import\s*\{\s*VoidReasonModal\s*\}\s*from\s*["']\.\.\/\.\.\/components\/accounting\/VoidReasonModal["']/.test(
    setlPage
  )
) {
  failures.push(
    "SettlementsPage must import VoidReasonModal from ../../components/accounting/VoidReasonModal (not pages/accounting)"
  );
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

const prevalidationDialog = read("apps/frontend/src/components/bulk/BulkPreValidationDialog.tsx");
if (!prevalidationDialog || !/bulk-prevalidation-summary/.test(prevalidationDialog)) {
  failures.push("BulkPreValidationDialog must surface blocked rows before bulk submit (SEL-03)");
}

const entityBulk = read("apps/frontend/src/components/bulk/useEntityBulkAction.ts");
if (!/precheck\?: BulkPrecheckRow\[\]/.test(entityBulk) || !/partitionBulkPrecheck/.test(entityBulk)) {
  failures.push("useEntityBulkAction must accept client precheck rows before POST (SEL-03)");
}

const billsPage = read("apps/frontend/src/pages/accounting/BillsPage.tsx");
if (!/billBulkPrecheckRows/.test(billsPage) || !/BulkPreValidationDialog/.test(billsPage)) {
  failures.push("BillsPage must wire bill bulk precheck + BulkPreValidationDialog (SEL-03)");
}

if (failures.length) {
  console.error(`${LABEL} FAIL`);
  for (const f of failures) console.error(`- ${f}`);
  process.exit(1);
}
console.log(`${LABEL} OK`);
process.exit(0);
