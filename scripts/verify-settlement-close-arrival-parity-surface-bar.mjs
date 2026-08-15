#!/usr/bin/env node
/**
 * SETL-F3552 — SettlementCloseArrivalPage draft JE preview must use ParityTable
 * (Search+Range+gear), not a raw HTML table that skips the surface bar.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = "apps/frontend/src/pages/driver-finance/SettlementCloseArrivalPage.tsx";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

export function check() {
  const src = fs.readFileSync(path.join(ROOT, PAGE), "utf8");
  assert(src.includes("ParityTable"), "SettlementCloseArrivalPage: must use ParityTable");
  assert(src.includes('storageKey="settlement-close-draft-je"'), "SettlementCloseArrivalPage: must set storageKey");
  assert(src.includes('tableTestId="settlement-close-draft-je-table"'), "SettlementCloseArrivalPage: must set tableTestId");
  assert(!/<table\b/.test(src), "SettlementCloseArrivalPage: must not use raw HTML table");
  assert(src.includes("Draft JE preview"), "SettlementCloseArrivalPage: keep draft JE preview chrome");
  assert(src.includes("settleAndPay"), "SettlementCloseArrivalPage: keep close mutation");
}

function selftest() {
  check();
  const filePath = path.join(ROOT, PAGE);
  const good = fs.readFileSync(filePath, "utf8");
  const planted = [
    "export function SettlementCloseArrivalPage() {",
    '  return <table className="min-w-full" data-testid="settlement-close-draft-je-table"><tbody /></table>;',
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
  console.log("verify-settlement-close-arrival-parity-surface-bar --selftest PASS");
}

const args = process.argv.slice(2);
if (args.includes("--selftest")) selftest();
else {
  check();
  console.log("verify-settlement-close-arrival-parity-surface-bar PASS");
}
