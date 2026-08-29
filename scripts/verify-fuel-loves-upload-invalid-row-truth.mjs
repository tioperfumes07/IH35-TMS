#!/usr/bin/env node
import { readFileSync } from "node:fs";

const source = readFileSync("apps/backend/src/fuel/loves-upload.routes.ts", "utf8");

function verify(s = source) {
  const failures = [];
  const normalizeStart = s.indexOf("export function normalizeLovesRows");
  const normalizeEnd = s.indexOf("async function normalizeRowsFromWorkbook", normalizeStart);
  const normalize = normalizeStart >= 0 && normalizeEnd > normalizeStart ? s.slice(normalizeStart, normalizeEnd) : "";
  const routeStart = s.indexOf('app.post("/api/v1/fuel/loves-prices/upload"');
  const route = routeStart >= 0 ? s.slice(routeStart) : "";

  if (!/\): \{ rows: LovesRow\[\]; rows_rejected: number \}/.test(normalize)) failures.push("normalizer must return rows plus rejected count");
  if (!/!Number\.isFinite\(price\) \|\| price <= 0[\s\S]*rowsRejected \+= 1/.test(normalize)) failures.push("invalid/non-positive prices must be counted as rejected");
  if (!/return \{ rows: normalized, rows_rejected: rowsRejected \}/.test(normalize)) failures.push("normalizer must preserve rejection count");
  if (!/normalizedWorkbook\.rows\.length === 0[\s\S]*noValidRows: true[\s\S]*rowsRejected: normalizedWorkbook\.rows_rejected/.test(route)) failures.push("all-invalid workbook must fail before success audit");
  if (!/rows_skipped: normalizedWorkbook\.rows_rejected/.test(route)) failures.push("mixed workbook response/audit must count rejected source rows");
  if (!/"noValidRows" in result[\s\S]*reply\.code\(400\)\.send\(\{ error: "no_valid_price_rows", rows_rejected: result\.rowsRejected \}\)/.test(route)) failures.push("mounted route must expose all-invalid workbook as HTTP 400 with count");
  if (!/ON CONFLICT \(operating_company_id, effective_date, station_name, station_address\)[\s\S]*DO UPDATE SET/.test(route)) failures.push("price persistence must use one atomic upsert on the canonical unique key");
  if (/const updateRes = await client\.query[\s\S]*const insertRes = await client\.query/.test(route)) failures.push("check-then-insert race must not return");
  if (!/RETURNING \(xmax = 0\) AS inserted[\s\S]*if \(!persisted\) throw new Error\("loves_price_upsert_failed"\)/.test(route)) failures.push("upsert must return and require persisted identity evidence");
  if (!/if \(persisted\.inserted\) counts\.rows_added \+= 1;[\s\S]*else counts\.rows_updated \+= 1;/.test(route)) failures.push("atomic upsert must retain honest added/updated counts");
  return failures;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    source.replace("): { rows: LovesRow[]; rows_rejected: number }", "): LovesRow[]"),
    source.replace(" || price <= 0", ""),
    source.replace("rowsRejected += 1;", "// planted lost rejection"),
    source.replace("normalizedWorkbook.rows.length === 0", "false"),
    source.replace("rows_skipped: normalizedWorkbook.rows_rejected", "rows_skipped: 0"),
    source.replace('error: "no_valid_price_rows"', 'error: "xlsx_required"'),
    source.replace("ON CONFLICT (operating_company_id, effective_date, station_name, station_address)", "ON CONFLICT DO NOTHING"),
    source.replace("RETURNING (xmax = 0) AS inserted", "RETURNING true AS inserted"),
    source.replace('if (!persisted) throw new Error("loves_price_upsert_failed");', "// planted missing persistence proof"),
    source.replace("else counts.rows_updated += 1;", "else counts.rows_skipped += 1;"),
  ];
  mutations.forEach((mutation, index) => {
    if (mutation === source || verify(mutation).length === 0) throw new Error(`selftest mutation escaped: ${index + 1}`);
  });
  console.log("[verify-fuel-loves-upload-invalid-row-truth] SELFTEST PASS (10/10)");
}

const failures = verify();
if (failures.length) {
  console.error("[verify-fuel-loves-upload-invalid-row-truth] FAIL");
  failures.forEach((failure) => console.error(`  - ${failure}`));
  process.exit(1);
}
console.log("[verify-fuel-loves-upload-invalid-row-truth] PASS");
