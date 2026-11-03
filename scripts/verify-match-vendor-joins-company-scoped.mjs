#!/usr/bin/env node
/**
 * Bank-match candidates name their vendor from the SAME company only. Found 11-03 (UI4 builder): the factoring-purchase,
 * bill-payment, bill and expense candidate queries in match.service.ts joined mdata.vendors by id alone — an id that pointed
 * at another company's vendor row would print that company's name in this company's Match drawer.
 * Static: every `JOIN mdata.vendors v ON ...` in the file carries `v.operating_company_id =`. --selftest plants an unscoped join.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE = "apps/backend/src/accounting/bank-recon/match.service.ts";
export function findDefects(src) {
  return src.split("\n").map((l, i) => [l, i + 1]).filter(([l]) => /JOIN mdata\.vendors v ON/.test(l) && !/v\.operating_company_id =/.test(l)).map(([, n]) => `${FILE}:${n} joins mdata.vendors without the company scope`);
}
const src = readFileSync(path.join(ROOT, FILE), "utf8");
if (process.argv.includes("--selftest")) {
  const planted = src.replace(" AND v.operating_company_id = e.operating_company_id", "");
  const ok = planted !== src && findDefects(planted).length > 0;
  console.log(`verify-match-vendor-joins-company-scoped SELFTEST: ${ok ? 1 : 0}/1 planted defects caught`);
  process.exit(ok ? 0 : 1);
}
const d = findDefects(src);
if (d.length) { console.error(`verify-match-vendor-joins-company-scoped FAIL:\n - ${d.join("\n - ")}`); process.exit(1); }
console.log("verify-match-vendor-joins-company-scoped PASS — every Match candidate vendor name comes from the same company");
