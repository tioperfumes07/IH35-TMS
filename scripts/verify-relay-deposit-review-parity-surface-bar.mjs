#!/usr/bin/env node
/**
 * FUEL-F3550 — RelayDepositReview must use ParityTable (Search+Range+gear) for
 * unclassified cards + all deposits, not raw HTML tables.
 * ROUND 443.250 — also asserts Relay inbox V3 KPI strip + V3Panel (chrome only).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = "apps/frontend/src/pages/fuel/components/RelayDepositReview.tsx";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

export function check(srcOverride) {
  const src = srcOverride ?? fs.readFileSync(path.join(ROOT, PAGE), "utf8");
  assert(src.includes("ParityTable"), "RelayDepositReview: must use ParityTable");
  assert(src.includes('storageKey="relay-deposit-unclassified-cards"'), "RelayDepositReview: unclassified storageKey");
  assert(src.includes('storageKey="relay-deposit-all"'), "RelayDepositReview: all-deposits storageKey");
  assert(src.includes('tableTestId="relay-deposit-all-table"'), "RelayDepositReview: all-deposits tableTestId");
  assert(!/<table\b/.test(src), "RelayDepositReview: must not use raw HTML table");
  assert(src.includes("getRelayDeposits"), "RelayDepositReview: keep deposits API");
  // ROUND 443.250 Relay inbox V3 chrome
  assert(
    src.includes("data-fuel-relay-inbox-v3-kpis") && src.includes("V3KpiTile"),
    "RelayDepositReview: ROUND 443.250 must ship V3KpiTile strip (data-fuel-relay-inbox-v3-kpis)",
  );
  assert(
    src.includes("fuel-relay-inbox-intro-v3-panel") && src.includes("V3Panel"),
    "RelayDepositReview: ROUND 443.250 must wrap intro in V3Panel (fuel-relay-inbox-intro-v3-panel)",
  );
  assert(
    src.includes("fuel-relay-inbox-unclassified-v3-panel") && src.includes("fuel-relay-inbox-all-v3-panel"),
    "RelayDepositReview: ROUND 443.250 must wrap unclassified + all deposits in V3Panels",
  );
}

function selftest() {
  check();
  const planted = [
    "export function RelayDepositReview() {",
    '  return <table className="w-full" data-testid="relay-deposit-all-table"><tbody /></table>;',
    "}",
    "",
  ].join("\n");
  let failed = false;
  try {
    check(planted);
  } catch {
    failed = true;
  }
  assert(failed, "selftest: expected FAIL on raw HTML table");

  const live = fs.readFileSync(path.join(ROOT, PAGE), "utf8");
  const v3Plants = [
    live.replace(/data-fuel-relay-inbox-v3-kpis/g, "data-fuel-relay-inbox-gone"),
    live.replace(/fuel-relay-inbox-intro-v3-panel/g, "fuel-relay-inbox-gone-panel"),
    live.replace(/fuel-relay-inbox-unclassified-v3-panel/g, "fuel-relay-inbox-gone-unclassified"),
  ];
  let v3Caught = 0;
  for (const plant of v3Plants) {
    try {
      check(plant);
    } catch {
      v3Caught += 1;
    }
  }
  assert(v3Caught === v3Plants.length, `selftest: expected FAIL on ${v3Plants.length} V3 plants, caught ${v3Caught}`);

  console.log("verify-relay-deposit-review-parity-surface-bar --selftest PASS");
}

const args = process.argv.slice(2);
if (args.includes("--selftest")) selftest();
else {
  check();
  console.log("verify-relay-deposit-review-parity-surface-bar PASS");
}
