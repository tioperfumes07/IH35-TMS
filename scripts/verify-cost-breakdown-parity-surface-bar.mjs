#!/usr/bin/env node
/**
 * ACCT-F3586 — CostBreakdownBox Section A must use ParityTable (Search+Range+gear),
 * not a raw HTML table.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { withMutatedCopy } from "./_lib/selftest-safe-mutation.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = "apps/frontend/src/components/forms/shared/CostBreakdownBox.tsx";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

export function check(filePath = path.join(ROOT, PAGE)) {
  const src = fs.readFileSync(filePath, "utf8");
  assert(src.includes("ParityTable"), "CostBreakdownBox: must use ParityTable");
  assert(src.includes("cost-breakdown-section-a-"), "CostBreakdownBox: section A storageKey");
  assert(src.includes('tableTestId="cost-breakdown-section-a-table"'), "CostBreakdownBox: tableTestId");
  assert(src.includes("embedded"), "CostBreakdownBox: ParityTable must be embedded");
  assert(src.includes("MoneyInput"), "CostBreakdownBox: keep MoneyInput on unit cost");
  assert(src.includes("ReferenceSelect"), "CostBreakdownBox: keep category ReferenceSelect");
  assert(!/<table\b/.test(src), "CostBreakdownBox: must not use raw HTML table");
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
    "export function CostBreakdownBox() {",
    '  return <table className="min-w-full" data-testid="cost-breakdown-section-a-table"><tbody /></table>;',
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
  console.log("verify-cost-breakdown-parity-surface-bar --selftest PASS");
}

const args = process.argv.slice(2);
if (args.includes("--selftest")) await selftest();
else {
  check();
  console.log("verify-cost-breakdown-parity-surface-bar PASS");
}
