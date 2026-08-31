#!/usr/bin/env node
/**
 * ACCT-F3590 — BillPaymentModal open-bills grid must use ParityTable (Search+Range+gear),
 * not a raw HTML table.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { withMutatedCopy } from "./_lib/selftest-safe-mutation.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = "apps/frontend/src/components/ap/BillPaymentModal.tsx";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

export function check(filePath = path.join(ROOT, PAGE)) {
  const src = fs.readFileSync(filePath, "utf8");
  assert(src.includes("ParityTable"), "BillPaymentModal: must use ParityTable");
  assert(src.includes('storageKey="bill-payment-modal-open-bills"'), "BillPaymentModal: storageKey");
  assert(src.includes('tableTestId="bill-payment-open-bills-table"'), "BillPaymentModal: tableTestId");
  assert(src.includes("embedded"), "BillPaymentModal: ParityTable must be embedded");
  assert(src.includes("selectable={!autoApply}"), "BillPaymentModal: selectable when manual apply");
  assert(src.includes("MoneyInput"), "BillPaymentModal: keep MoneyInput on Apply");
  assert(!/<table\b/.test(src), "BillPaymentModal: must not use raw HTML table");
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
    "export function BillPaymentModal() {",
    '  return <table className="min-w-full" data-testid="bill-payment-open-bills-table"><tbody /></table>;',
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
  console.log("verify-bill-payment-modal-parity-surface-bar --selftest PASS");
}

const args = process.argv.slice(2);
if (args.includes("--selftest")) await selftest();
else {
  check();
  console.log("verify-bill-payment-modal-parity-surface-bar PASS");
}
