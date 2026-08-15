#!/usr/bin/env node
/**
 * ACCT-F3584 — AllocationPreviewTable must use ParityTable (Search+Range+gear),
 * not a raw HTML table.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = "apps/frontend/src/components/allocation/AllocationPreviewTable.tsx";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

export function check() {
  const src = fs.readFileSync(path.join(ROOT, PAGE), "utf8");
  assert(src.includes("ParityTable"), "AllocationPreviewTable: must use ParityTable");
  assert(src.includes('storageKey="allocation-preview-rows"'), "AllocationPreviewTable: storageKey");
  assert(src.includes('tableTestId="allocation-preview-table"'), "AllocationPreviewTable: tableTestId");
  assert(src.includes("embedded"), "AllocationPreviewTable: ParityTable must be embedded");
  assert(src.includes("Penny-exact"), "AllocationPreviewTable: keep balance status copy");
  assert(!/<table\b/.test(src), "AllocationPreviewTable: must not use raw HTML table");
}

function selftest() {
  check();
  const filePath = path.join(ROOT, PAGE);
  const good = fs.readFileSync(filePath, "utf8");
  const planted = [
    "export function AllocationPreviewTable() {",
    '  return <table className="min-w-full" data-testid="allocation-preview-table"><tbody /></table>;',
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
  console.log("verify-allocation-preview-parity-surface-bar --selftest PASS");
}

const args = process.argv.slice(2);
if (args.includes("--selftest")) selftest();
else {
  check();
  console.log("verify-allocation-preview-parity-surface-bar PASS");
}
