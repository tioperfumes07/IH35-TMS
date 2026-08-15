#!/usr/bin/env node
/**
 * ACCT-F3574 — CoaAsymmetryReportPanel postable-by-entity summary must use ParityTable
 * (Search+Range+gear), not a raw HTML table.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = "apps/frontend/src/pages/accounting/CoaAsymmetryReportPanel.tsx";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

export function check() {
  const src = fs.readFileSync(path.join(ROOT, PAGE), "utf8");
  assert(src.includes("ParityTable"), "CoaAsymmetryReportPanel: must use ParityTable");
  assert(src.includes('storageKey="coa-asymmetry-postable-by-entity"'), "CoaAsymmetryReportPanel: storageKey");
  assert(src.includes('tableTestId="coa-asymmetry-postable-by-entity-table"'), "CoaAsymmetryReportPanel: tableTestId");
  assert(src.includes("getCoaAsymmetryReport"), "CoaAsymmetryReportPanel: keep report API");
  assert(src.includes("coa-asymmetry-account-link"), "CoaAsymmetryReportPanel: keep sample account drill testid");
  assert(!/<table\b/.test(src), "CoaAsymmetryReportPanel: must not use raw HTML table");
}

function selftest() {
  check();
  const filePath = path.join(ROOT, PAGE);
  const good = fs.readFileSync(filePath, "utf8");
  const planted = [
    "export function CoaAsymmetryReportPanel() {",
    '  return <table className="w-full" data-testid="coa-asymmetry-postable-by-entity-table"><tbody /></table>;',
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
  console.log("verify-coa-asymmetry-parity-surface-bar --selftest PASS");
}

const args = process.argv.slice(2);
if (args.includes("--selftest")) selftest();
else {
  check();
  console.log("verify-coa-asymmetry-parity-surface-bar PASS");
}
