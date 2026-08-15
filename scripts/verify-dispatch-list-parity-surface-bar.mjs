#!/usr/bin/env node
/**
 * DISP-F3600 — archived DispatchList desktop grid must use ParityTable
 * (Search+Range+gear), not a raw HTML table.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = "apps/frontend/src/components/dispatch/DispatchList.tsx";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

export function check() {
  const src = fs.readFileSync(path.join(ROOT, PAGE), "utf8");
  assert(src.includes("ParityTable"), "DispatchList: must use ParityTable");
  assert(src.includes('storageKey="dispatch-list-archived"'), "DispatchList: storageKey");
  assert(src.includes('tableTestId="dispatch-list-parity-table"'), "DispatchList: tableTestId");
  assert(src.includes("DriverHosClockValue"), "DispatchList: keep HOS clock values");
  assert(src.includes("InlineDriverPicker"), "DispatchList: keep InlineDriverPicker");
  assert(src.includes("InlineUnitPicker"), "DispatchList: keep InlineUnitPicker");
  assert(!/<table\b/.test(src), "DispatchList: must not use raw HTML table");
}

function selftest() {
  check();
  const filePath = path.join(ROOT, PAGE);
  const good = fs.readFileSync(filePath, "utf8");
  const planted = [
    "export function DispatchList() {",
    '  return <table className="w-full" data-testid="dispatch-list-parity-table"><tbody /></table>;',
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
  console.log("verify-dispatch-list-parity-surface-bar --selftest PASS");
}

const args = process.argv.slice(2);
if (args.includes("--selftest")) selftest();
else {
  check();
  console.log("verify-dispatch-list-parity-surface-bar PASS");
}
