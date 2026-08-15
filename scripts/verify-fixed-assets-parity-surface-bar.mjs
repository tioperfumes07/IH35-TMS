#!/usr/bin/env node
/**
 * FA-F3566 — FixedAssetsPage depreciation schedule must use ParityTable
 * (Search+Range+gear), not a raw HTML table that skips the surface bar.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = "apps/frontend/src/pages/accounting/FixedAssetsPage.tsx";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

export function check() {
  const src = fs.readFileSync(path.join(ROOT, PAGE), "utf8");
  assert(src.includes("ParityTable"), "FixedAssetsPage: must use ParityTable");
  assert(src.includes('storageKey="fixed-asset-depreciation-schedule"'), "FixedAssetsPage: schedule storageKey");
  assert(src.includes('tableTestId="fixed-asset-depreciation-schedule-table"'), "FixedAssetsPage: schedule tableTestId");
  assert(src.includes("fixed-asset-schedule-je-"), "FixedAssetsPage: keep schedule JE test ids");
  assert(!/<table\b/.test(src), "FixedAssetsPage: must not use raw HTML table");
  assert(src.includes("getFixedAssetDetail"), "FixedAssetsPage: keep detail API");
  assert(src.includes("getFixedAssets"), "FixedAssetsPage: keep list API");
}

function selftest() {
  check();
  const filePath = path.join(ROOT, PAGE);
  const good = fs.readFileSync(filePath, "utf8");
  const planted = [
    "export function FixedAssetsPage() {",
    '  return <table className="min-w-full" data-testid="fixed-asset-depreciation-schedule-table"><tbody /></table>;',
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
  console.log("verify-fixed-assets-parity-surface-bar --selftest PASS");
}

const args = process.argv.slice(2);
if (args.includes("--selftest")) selftest();
else {
  check();
  console.log("verify-fixed-assets-parity-surface-bar PASS");
}
