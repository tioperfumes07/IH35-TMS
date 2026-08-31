#!/usr/bin/env node
/**
 * ACCT-F3594 — InvoiceCreateModal from-load pick list must use ParityTable
 * (Search+Range+gear), not a raw HTML table.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { withMutatedCopy } from "./_lib/selftest-safe-mutation.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = "apps/frontend/src/pages/accounting/InvoiceCreateModal.tsx";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

export function check(filePath = path.join(ROOT, PAGE)) {
  const src = fs.readFileSync(filePath, "utf8");
  assert(src.includes("ParityTable"), "InvoiceCreateModal: must use ParityTable");
  assert(src.includes('storageKey="invoice-create-modal-from-load"'), "InvoiceCreateModal: storageKey");
  assert(src.includes('tableTestId="invoice-create-from-load-table"'), "InvoiceCreateModal: tableTestId");
  assert(src.includes("embedded"), "InvoiceCreateModal: ParityTable must be embedded");
  assert(src.includes("createFromLoad"), "InvoiceCreateModal: keep createFromLoad Select action");
  assert(!/<table\b/.test(src), "InvoiceCreateModal: must not use raw HTML table");
}

// GUARD-SELFTEST-MUTATES-SOURCE fix: never write the plant into the real tracked file. Copy it
// to a temp path (withMutatedCopy), plant there, assert against the copy — apps/ is never touched.
async function selftest() {
  check();
  const realPath = path.join(ROOT, PAGE);
  let failed = false;
  await withMutatedCopy(
    realPath,
    (good) => {
  const planted = [
    "export function InvoiceCreateModal() {",
    '  return <table className="w-full" data-testid="invoice-create-from-load-table"><tbody /></table>;',
    "}",
    "",
  ].join("\n");
      return planted;
    },
    (tmpPath) => {
      try {
        check(tmpPath);
      } catch {
        failed = true;
      }
    },
  );
  assert(failed, "selftest: expected FAIL on raw HTML table");
  console.log("verify-invoice-create-modal-parity-surface-bar --selftest PASS");
}

const args = process.argv.slice(2);
if (args.includes("--selftest")) await selftest();
else {
  check();
  console.log("verify-invoice-create-modal-parity-surface-bar PASS");
}
