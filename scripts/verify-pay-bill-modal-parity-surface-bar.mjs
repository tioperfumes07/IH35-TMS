#!/usr/bin/env node
/**
 * ACCT-F3588 — PayBillModal apply-to-bill grid must use ParityTable (Search+Range+gear),
 * not a raw HTML table.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { withMutatedCopy } from "./_lib/selftest-safe-mutation.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = "apps/frontend/src/pages/accounting/PayBillModal.tsx";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

export function check(filePath = path.join(ROOT, PAGE)) {
  const src = fs.readFileSync(filePath, "utf8");
  assert(src.includes("ParityTable"), "PayBillModal: must use ParityTable");
  assert(src.includes('storageKey="pay-bill-modal-apply"'), "PayBillModal: apply storageKey");
  assert(src.includes('tableTestId="pay-bill-apply-table"'), "PayBillModal: tableTestId");
  assert(src.includes("embedded"), "PayBillModal: ParityTable must be embedded");
  assert(src.includes("MoneyInput"), "PayBillModal: keep MoneyInput on Apply");
  assert(src.includes('kind="bill"'), "PayBillModal: keep bill EntityLink");
  assert(!/<table\b/.test(src), "PayBillModal: must not use raw HTML table");
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
    "export function PayBillModal() {",
    '  return <table className="min-w-full" data-testid="pay-bill-apply-table"><tbody /></table>;',
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
  console.log("verify-pay-bill-modal-parity-surface-bar --selftest PASS");
}

const args = process.argv.slice(2);
if (args.includes("--selftest")) await selftest();
else {
  check();
  console.log("verify-pay-bill-modal-parity-surface-bar PASS");
}
