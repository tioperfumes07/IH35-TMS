#!/usr/bin/env node
/**
 * verify-vendor-report-pays-through-entitylink — ROUND 8.20 board10/31.
 * Vendor report Pays-through column must EntityLink the CoA account when
 * pays_through_account_id is present (not plain text).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-vendor-report-pays-through-entitylink";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE = "apps/frontend/src/pages/reports/boards/VendorReportBoard.tsx";
const API = "apps/frontend/src/api/reports.ts";

export function check(boardSrc, apiSrc) {
  const f = [];
  if (!boardSrc) f.push("VendorReportBoard.tsx missing");
  if (!apiSrc) f.push("reports.ts missing");
  if (boardSrc && !/pays_through_account_id/.test(boardSrc)) {
    f.push("VendorReportBoard does not read pays_through_account_id");
  }
  if (boardSrc && !/EntityLink kind="account"[\s\S]*pays_through_account_id/.test(boardSrc.replace(/\n/g, " "))) {
    f.push("Pays-through is not an EntityLink kind=account");
  }
  if (apiSrc && !/pays_through_account_id\??:/.test(apiSrc)) {
    f.push("VendorBoardReportRow type omits pays_through_account_id");
  }
  return f;
}

function selftest(board, api) {
  const cases = [
    ["no account id use", board.replace(/pays_through_account_id/g, "x"), api],
    ["type missing", board, api.replace(/pays_through_account_id\??:[^\n]+/, "")],
    ["file deleted", "", api],
  ];
  let pass = check(board, api).length === 0 ? 1 : 0;
  if (!pass) console.error(`${LABEL} --selftest: live tree fails`, check(board, api));
  for (const [name, b, a] of cases) {
    if (check(b, a).length > 0) pass += 1;
    else console.error(`${LABEL} --selftest: did not catch "${name}"`);
  }
  const total = cases.length + 1;
  if (pass !== total) {
    console.error(`${LABEL} --selftest FAIL ${pass}/${total}`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS ${pass}/${total}`);
}

const board = fs.existsSync(path.join(ROOT, FILE)) ? fs.readFileSync(path.join(ROOT, FILE), "utf8") : "";
const api = fs.existsSync(path.join(ROOT, API)) ? fs.readFileSync(path.join(ROOT, API), "utf8") : "";
if (process.argv.includes("--selftest")) selftest(board, api);
else {
  const f = check(board, api);
  if (f.length) {
    for (const x of f) console.error(`${LABEL}: FAIL — ${x}`);
    process.exit(1);
  }
  console.log(`${LABEL}: PASS — Vendor report Pays-through EntityLinks CoA account`);
}
