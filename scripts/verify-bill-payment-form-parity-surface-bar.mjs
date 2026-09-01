#!/usr/bin/env node
/**
 * BANK-F3596 — BillPaymentForm apply grid must use ParityTable (Search+Range+gear),
 * not a raw HTML table (archived Workflow-B leaf).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { withMutatedCopy } from "./_lib/selftest-safe-mutation.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = "apps/frontend/src/pages/banking/components/forms/BillPaymentForm.tsx";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

export function check(filePath = path.join(ROOT, PAGE)) {
  const src = fs.readFileSync(filePath, "utf8");
  assert(src.includes("ParityTable"), "BillPaymentForm: must use ParityTable");
  assert(src.includes('storageKey="bill-payment-form-apply"'), "BillPaymentForm: storageKey");
  assert(src.includes('tableTestId="bill-payment-form-apply-table"'), "BillPaymentForm: tableTestId");
  assert(src.includes("embedded"), "BillPaymentForm: ParityTable must be embedded");
  assert(src.includes("apply_amount_usd"), "BillPaymentForm: keep apply amount field");
  assert(!/<table\b/.test(src), "BillPaymentForm: must not use raw HTML table");
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
    "export function BillPaymentForm() {",
    '  return <table className="min-w-full" data-testid="bill-payment-form-apply-table"><tbody /></table>;',
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
  console.log("verify-bill-payment-form-parity-surface-bar --selftest PASS");
}

const args = process.argv.slice(2);
if (args.includes("--selftest")) await selftest();
else {
  check();
  console.log("verify-bill-payment-form-parity-surface-bar PASS");
}
