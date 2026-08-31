#!/usr/bin/env node
/**
 * ACCT-F3592 — SubmitFactoringModal candidate-invoice grid must use ParityTable
 * (Search+Range+gear + selectable), not a raw HTML table.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { withMutatedCopy } from "./_lib/selftest-safe-mutation.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = "apps/frontend/src/pages/accounting/SubmitFactoringModal.tsx";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

export function check(filePath = path.join(ROOT, PAGE)) {
  const src = fs.readFileSync(filePath, "utf8");
  assert(src.includes("ParityTable"), "SubmitFactoringModal: must use ParityTable");
  assert(src.includes('storageKey="submit-factoring-modal-candidates"'), "SubmitFactoringModal: storageKey");
  assert(src.includes('tableTestId="submit-factoring-candidates-table"'), "SubmitFactoringModal: tableTestId");
  assert(src.includes("embedded"), "SubmitFactoringModal: ParityTable must be embedded");
  assert(src.includes("selectable"), "SubmitFactoringModal: must keep selectable invoice pick");
  assert(src.includes("onSelectionChange={setSelectedInvoiceIds}"), "SubmitFactoringModal: selection wired");
  assert(src.includes('kind="invoice"'), "SubmitFactoringModal: keep invoice drill link");
  assert(!/<table\b/.test(src), "SubmitFactoringModal: must not use raw HTML table");
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
    "export function SubmitFactoringModal() {",
    '  return <table className="min-w-full" data-testid="submit-factoring-candidates-table"><tbody /></table>;',
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
  console.log("verify-submit-factoring-modal-parity-surface-bar --selftest PASS");
}

const args = process.argv.slice(2);
if (args.includes("--selftest")) await selftest();
else {
  check();
  console.log("verify-submit-factoring-modal-parity-surface-bar PASS");
}
