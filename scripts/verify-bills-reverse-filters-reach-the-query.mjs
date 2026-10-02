#!/usr/bin/env node
// ROUND 297 driver-profile audit (CC-1) — a profile's Bills panel lists only that profile's bills.
// BillsReverseSection passed { driver_id } (driver profile) and { trailer_id } (trailer profile), but listBills never
// put either in the URL and the list schema had no such field: zod dropped them, and the panel listed EVERY bill in
// the company — voided included — with live Pay buttons (D1: 93 bills / $64,457.23 shown, 14 / $13,357.15 real).
// This guard fails when any key of BillsReverseSection's Filter union is missing from one hop:
//   1. listBills (api/accounting.ts) sets it on the query string;
//   2. listBillsQuerySchema (bills.routes.ts) accepts it;
//   3. the list route maps it into the list options (twice: /bills and /bills/register);
//   4. buildAllBillsWhereClause (bills.service.ts) filters on it.
// It also fails if the panel stops hiding voided bills (status: "active").
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-bills-reverse-filters-reach-the-query";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const F = {
  panel: "apps/frontend/src/components/accounting/BillsReverseSection.tsx",
  api: "apps/frontend/src/api/accounting.ts",
  routes: "apps/backend/src/accounting/bills.routes.ts",
  service: "apps/backend/src/accounting/bills.service.ts",
};
const camel = (k) => k.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
// load_id is a bill_lines EXISTS filter; insurance_claim_id a header column — both mapped like the rest.
const OPTION_COLUMN = { load_id: /bill_lines[\s\S]{0,200}load_id/ };

export function problems(src) {
  const p = [];
  const filterBlock = src.panel.match(/type Filter =([\s\S]*?);\n/)?.[1] ?? "";
  const keys = [...new Set([...filterBlock.matchAll(/\{\s*([a-z_]+): string;/g)].map((m) => m[1]))];
  if (keys.length < 5) p.push(`could not read BillsReverseSection's Filter union (found ${keys.length} keys)`);
  const apiStart = src.api.indexOf("export function listBills(");
  const apiFn = src.api.slice(apiStart, src.api.indexOf("/api/v1/accounting/bills?", apiStart));
  const schema = src.routes.slice(src.routes.indexOf("const listBillsQuerySchema"), src.routes.indexOf("const billRegisterQuerySchema"));
  const where = src.service.slice(src.service.indexOf("function buildAllBillsWhereClause"), src.service.indexOf("function buildAllBillsWhereClause") + 6000);
  for (const k of keys) {
    if (!new RegExp(`query\\.set\\("${k}", params\\.${k}\\)`).test(apiFn)) p.push(`listBills never sends ${k} (api/accounting.ts)`);
    if (!new RegExp(`\\b${k}: z\\.`).test(schema)) p.push(`listBillsQuerySchema drops ${k} (bills.routes.ts)`);
    const mapped = (src.routes.match(new RegExp(`${camel(k)}: query\\.data\\.${k}`, "g")) ?? []).length;
    if (mapped < 2) p.push(`bills.routes.ts maps ${k} into ${mapped} of 2 list-option sets`);
    const col = OPTION_COLUMN[k] ?? new RegExp(`b\\.${k} = \\$`);
    if (!new RegExp(`options\\.${camel(k)}`).test(where) || !col.test(where)) p.push(`buildAllBillsWhereClause never filters on ${k}`);
  }
  if (!/listBills\(operatingCompanyId, \{ \.\.\.filter, status: "active"/.test(src.panel)) p.push('the Bills panel must hide voided bills (status: "active")');
  return p;
}

export function run() {
  return problems(Object.fromEntries(Object.entries(F).map(([k, v]) => [k, readFileSync(path.join(ROOT, v), "utf8")])));
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const src = Object.fromEntries(Object.entries(F).map(([k, v]) => [k, readFileSync(path.join(ROOT, v), "utf8")]));
  const own = problems(src);
  if (process.argv.includes("--selftest")) {
    if (own.length) { console.error(`${LABEL} --selftest FAIL on the real tree — ${own.join("; ")}`); process.exit(1); }
    const plants = [
      ["api drops driver_id", { ...src, api: (() => { const i = src.api.indexOf("export function listBills("); return src.api.slice(0, i) + src.api.slice(i).replace('query.set("driver_id", params.driver_id)', "void 0"); })() }],
      ["schema drops trailer_id", { ...src, routes: src.routes.replace("  trailer_id: z.string().uuid().optional(),\n", "") }],
      ["where drops driver_id", { ...src, service: src.service.replace("where.push(`b.driver_id = $${values.length}::uuid`);\n  }", "}") }],
      ["voided shown", { ...src, panel: src.panel.replace('status: "active", ', "") }],
    ];
    for (const [name, planted] of plants) {
      if (!problems(planted).length) { console.error(`${LABEL} --selftest FAIL — plant "${name}" not caught`); process.exit(1); }
    }
    console.log(`${LABEL} --selftest PASS (real tree clean; ${plants.length}/${plants.length} plants caught)`);
    process.exit(0);
  }
  if (own.length) { console.error(`${LABEL}: FAIL —\n  ${own.join("\n  ")}`); process.exit(1); }
  console.log(`${LABEL}: OK — every Bills-panel filter (claim, unit, load, driver, trailer) reaches the SQL; voided bills hidden.`);
}
