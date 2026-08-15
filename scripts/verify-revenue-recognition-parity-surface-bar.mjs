#!/usr/bin/env node
/**
 * ACCT-F3570 — RevenueRecognitionPage obligation schedules must use ParityTable
 * (Search+Range+gear), not raw HTML tables that skip the surface bar.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = "apps/frontend/src/pages/accounting/RevenueRecognitionPage.tsx";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

export function check() {
  const src = fs.readFileSync(path.join(ROOT, PAGE), "utf8");
  assert(src.includes("ParityTable"), "RevenueRecognitionPage: must use ParityTable");
  assert(src.includes("revenue-obligation-schedule-"), "RevenueRecognitionPage: obligation schedule storageKey/testId");
  assert(src.includes("ObligationBlock"), "RevenueRecognitionPage: keep ObligationBlock");
  assert(!/<table\b/.test(src), "RevenueRecognitionPage: must not use raw HTML table");
  assert(src.includes("getRevenueContracts"), "RevenueRecognitionPage: keep contracts API");
  assert(src.includes("getRevenueContractDetail"), "RevenueRecognitionPage: keep detail API");
}

function selftest() {
  check();
  const filePath = path.join(ROOT, PAGE);
  const good = fs.readFileSync(filePath, "utf8");
  const planted = [
    "export function RevenueRecognitionPage() {",
    '  return <table className="min-w-full" data-testid="revenue-obligation-schedule-1"><tbody /></table>;',
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
  console.log("verify-revenue-recognition-parity-surface-bar --selftest PASS");
}

const args = process.argv.slice(2);
if (args.includes("--selftest")) selftest();
else {
  check();
  console.log("verify-revenue-recognition-parity-surface-bar PASS");
}
