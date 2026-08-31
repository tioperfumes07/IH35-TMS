#!/usr/bin/env node
/**
 * DISP-F3600 — archived DispatchList desktop grid must use ParityTable
 * (Search+Range+gear), not a raw HTML table.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { withMutatedCopy } from "./_lib/selftest-safe-mutation.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = "apps/frontend/src/components/dispatch/DispatchList.tsx";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

export function check(filePath = path.join(ROOT, PAGE)) {
  const src = fs.readFileSync(filePath, "utf8");
  assert(src.includes("ParityTable"), "DispatchList: must use ParityTable");
  assert(src.includes('storageKey="dispatch-list-archived"'), "DispatchList: storageKey");
  assert(src.includes('tableTestId="dispatch-list-parity-table"'), "DispatchList: tableTestId");
  assert(src.includes("DriverHosClockValue"), "DispatchList: keep HOS clock values");
  assert(src.includes("InlineDriverPicker"), "DispatchList: keep InlineDriverPicker");
  assert(src.includes("InlineUnitPicker"), "DispatchList: keep InlineUnitPicker");
  assert(!/<table\b/.test(src), "DispatchList: must not use raw HTML table");
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
    "export function DispatchList() {",
    '  return <table className="w-full" data-testid="dispatch-list-parity-table"><tbody /></table>;',
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
  console.log("verify-dispatch-list-parity-surface-bar --selftest PASS");
}

const args = process.argv.slice(2);
if (args.includes("--selftest")) await selftest();
else {
  check();
  console.log("verify-dispatch-list-parity-surface-bar PASS");
}
