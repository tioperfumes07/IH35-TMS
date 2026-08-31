#!/usr/bin/env node
/**
 * ACCT-F3570 — RevenueRecognitionPage obligation schedules must use ParityTable
 * (Search+Range+gear), not raw HTML tables that skip the surface bar.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { withMutatedCopy } from "./_lib/selftest-safe-mutation.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = "apps/frontend/src/pages/accounting/RevenueRecognitionPage.tsx";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

export function check(filePath = path.join(ROOT, PAGE)) {
  const src = fs.readFileSync(filePath, "utf8");
  assert(src.includes("ParityTable"), "RevenueRecognitionPage: must use ParityTable");
  assert(src.includes("revenue-obligation-schedule-"), "RevenueRecognitionPage: obligation schedule storageKey/testId");
  assert(src.includes("ObligationBlock"), "RevenueRecognitionPage: keep ObligationBlock");
  assert(!/<table\b/.test(src), "RevenueRecognitionPage: must not use raw HTML table");
  assert(src.includes("getRevenueContracts"), "RevenueRecognitionPage: keep contracts API");
  assert(src.includes("getRevenueContractDetail"), "RevenueRecognitionPage: keep detail API");
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
    "export function RevenueRecognitionPage() {",
    '  return <table className="min-w-full" data-testid="revenue-obligation-schedule-1"><tbody /></table>;',
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
  console.log("verify-revenue-recognition-parity-surface-bar --selftest PASS");
}

const args = process.argv.slice(2);
if (args.includes("--selftest")) await selftest();
else {
  check();
  console.log("verify-revenue-recognition-parity-surface-bar PASS");
}
