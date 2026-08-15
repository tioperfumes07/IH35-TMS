#!/usr/bin/env node
/**
 * MAINT-F3598 — CreateWorkOrderModal edit cost-lines grid must use ParityTable
 * (Search+Range+gear), not a raw HTML table.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = "apps/frontend/src/pages/maintenance/components/CreateWorkOrderModal.tsx";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

export function check() {
  const src = fs.readFileSync(path.join(ROOT, PAGE), "utf8");
  assert(src.includes("ParityTable"), "CreateWorkOrderModal: must use ParityTable");
  assert(src.includes('storageKey="create-wo-modal-edit-cost-lines"'), "CreateWorkOrderModal: storageKey");
  assert(src.includes('tableTestId="create-wo-edit-cost-lines-table"'), "CreateWorkOrderModal: tableTestId");
  assert(src.includes("embedded"), "CreateWorkOrderModal: ParityTable must be embedded");
  assert(src.includes('data-testid="edit-wo-lines-body"'), "CreateWorkOrderModal: keep edit-wo-lines-body testid");
  assert(src.includes("MoneyInput"), "CreateWorkOrderModal: keep MoneyInput on cost lines");
  assert(!/<table\b/.test(src), "CreateWorkOrderModal: must not use raw HTML table");
}

function selftest() {
  check();
  const filePath = path.join(ROOT, PAGE);
  const good = fs.readFileSync(filePath, "utf8");
  const planted = [
    "export function CreateWorkOrderModal() {",
    '  return <table className="min-w-full" data-testid="create-wo-edit-cost-lines-table"><tbody /></table>;',
    "}",
    "",
  ].join("\n");
  fs.writeFileSync(filePath, planted);
  let failed = false;
  try {
    check();
  } catch {
    failed = true;
  }
  fs.writeFileSync(filePath, good);
  assert(failed, "selftest: expected FAIL on raw HTML table");
  console.log("verify-create-work-order-modal-parity-surface-bar --selftest PASS");
}

const args = process.argv.slice(2);
if (args.includes("--selftest")) selftest();
else {
  check();
  console.log("verify-create-work-order-modal-parity-surface-bar PASS");
}
