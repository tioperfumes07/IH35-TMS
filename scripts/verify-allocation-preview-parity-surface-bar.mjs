#!/usr/bin/env node
/**
 * ACCT-F3584 — AllocationPreviewTable must use ParityTable (Search+Range+gear),
 * not a raw HTML table.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { withMutatedCopy } from "./_lib/selftest-safe-mutation.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = "apps/frontend/src/components/allocation/AllocationPreviewTable.tsx";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

export function check(filePath = path.join(ROOT, PAGE)) {
  const src = fs.readFileSync(filePath, "utf8");
  assert(src.includes("ParityTable"), "AllocationPreviewTable: must use ParityTable");
  assert(src.includes('storageKey="allocation-preview-rows"'), "AllocationPreviewTable: storageKey");
  assert(src.includes('tableTestId="allocation-preview-table"'), "AllocationPreviewTable: tableTestId");
  assert(src.includes("embedded"), "AllocationPreviewTable: ParityTable must be embedded");
  assert(src.includes("Penny-exact"), "AllocationPreviewTable: keep balance status copy");
  assert(!/<table\b/.test(src), "AllocationPreviewTable: must not use raw HTML table");
}

// GUARD-SELFTEST-MUTATES-SOURCE fix: never write the plant into the real tracked file. Copy it to
// a temp path (withMutatedCopy), plant there, assert against the copy — apps/ is never touched.
async function selftest() {
  check();
  const realPath = path.join(ROOT, PAGE);
  const planted = [
    "export function AllocationPreviewTable() {",
    '  return <table className="min-w-full" data-testid="allocation-preview-table"><tbody /></table>;',
    "}",
    "",
  ].join("\n");
  let failed = false;
  await withMutatedCopy(realPath, () => planted, (tmpPath) => {
    try {
      check(tmpPath);
    } catch {
      failed = true;
    }
  });
  assert(failed, "selftest: expected FAIL on raw HTML table");
  console.log("verify-allocation-preview-parity-surface-bar --selftest PASS");
}

const args = process.argv.slice(2);
if (args.includes("--selftest")) await selftest();
else {
  check();
  console.log("verify-allocation-preview-parity-surface-bar PASS");
}
