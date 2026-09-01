#!/usr/bin/env node
/**
 * ACCT-F3574 — CoaAsymmetryReportPanel postable-by-entity summary must use ParityTable
 * (Search+Range+gear), not a raw HTML table.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { withMutatedCopy } from "./_lib/selftest-safe-mutation.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = "apps/frontend/src/pages/accounting/CoaAsymmetryReportPanel.tsx";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

export function check(filePath = path.join(ROOT, PAGE)) {
  const src = fs.readFileSync(filePath, "utf8");
  assert(src.includes("ParityTable"), "CoaAsymmetryReportPanel: must use ParityTable");
  assert(src.includes('storageKey="coa-asymmetry-postable-by-entity"'), "CoaAsymmetryReportPanel: storageKey");
  assert(src.includes('tableTestId="coa-asymmetry-postable-by-entity-table"'), "CoaAsymmetryReportPanel: tableTestId");
  assert(src.includes("getCoaAsymmetryReport"), "CoaAsymmetryReportPanel: keep report API");
  assert(src.includes("coa-asymmetry-account-link"), "CoaAsymmetryReportPanel: keep sample account drill testid");
  assert(!/<table\b/.test(src), "CoaAsymmetryReportPanel: must not use raw HTML table");
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
    "export function CoaAsymmetryReportPanel() {",
    '  return <table className="w-full" data-testid="coa-asymmetry-postable-by-entity-table"><tbody /></table>;',
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
  console.log("verify-coa-asymmetry-parity-surface-bar --selftest PASS");
}

const args = process.argv.slice(2);
if (args.includes("--selftest")) await selftest();
else {
  check();
  console.log("verify-coa-asymmetry-parity-surface-bar PASS");
}
