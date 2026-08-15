#!/usr/bin/env node
/**
 * SETL-F3554 — PayRunClosePanel JE legs must use ParityTable (Search+Range+gear),
 * not a raw HTML table that skips the surface bar.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = "apps/frontend/src/pages/driver-finance/components/PayRunClosePanel.tsx";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

export function check() {
  const src = fs.readFileSync(path.join(ROOT, PAGE), "utf8");
  assert(src.includes("ParityTable"), "PayRunClosePanel: must use ParityTable");
  assert(src.includes('storageKey="payrun-je-legs"'), "PayRunClosePanel: must set storageKey");
  assert(src.includes('tableTestId="payrun-je-legs"'), "PayRunClosePanel: must keep payrun-je-legs test id");
  assert(!/<table\b/.test(src), "PayRunClosePanel: must not use raw HTML table");
  assert(src.includes("previewSettlementPayRun"), "PayRunClosePanel: keep preview API");
  assert(src.includes("closeSettlementPayRun"), "PayRunClosePanel: keep close API");
}

function selftest() {
  check();
  const filePath = path.join(ROOT, PAGE);
  const good = fs.readFileSync(filePath, "utf8");
  const planted = [
    "export function PayRunClosePanel() {",
    '  return <table className="w-full" data-testid="payrun-je-legs"><tbody /></table>;',
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
  console.log("verify-pay-run-close-parity-surface-bar --selftest PASS");
}

const args = process.argv.slice(2);
if (args.includes("--selftest")) selftest();
else {
  check();
  console.log("verify-pay-run-close-parity-surface-bar PASS");
}
