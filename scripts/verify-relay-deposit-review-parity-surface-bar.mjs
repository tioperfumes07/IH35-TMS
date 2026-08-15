#!/usr/bin/env node
/**
 * FUEL-F3550 — RelayDepositReview must use ParityTable (Search+Range+gear) for
 * unclassified cards + all deposits, not raw HTML tables.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = "apps/frontend/src/pages/fuel/components/RelayDepositReview.tsx";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

export function check() {
  const src = fs.readFileSync(path.join(ROOT, PAGE), "utf8");
  assert(src.includes("ParityTable"), "RelayDepositReview: must use ParityTable");
  assert(src.includes('storageKey="relay-deposit-unclassified-cards"'), "RelayDepositReview: unclassified storageKey");
  assert(src.includes('storageKey="relay-deposit-all"'), "RelayDepositReview: all-deposits storageKey");
  assert(src.includes('tableTestId="relay-deposit-all-table"'), "RelayDepositReview: all-deposits tableTestId");
  assert(!/<table\b/.test(src), "RelayDepositReview: must not use raw HTML table");
  assert(src.includes("getRelayDeposits"), "RelayDepositReview: keep deposits API");
}

function selftest() {
  check();
  const filePath = path.join(ROOT, PAGE);
  const good = fs.readFileSync(filePath, "utf8");
  const planted = [
    "export function RelayDepositReview() {",
    '  return <table className="w-full" data-testid="relay-deposit-all-table"><tbody /></table>;',
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
  console.log("verify-relay-deposit-review-parity-surface-bar --selftest PASS");
}

const args = process.argv.slice(2);
if (args.includes("--selftest")) selftest();
else {
  check();
  console.log("verify-relay-deposit-review-parity-surface-bar PASS");
}
