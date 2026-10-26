#!/usr/bin/env node
/**
 * LEAD 443.219 G-VOCAB (10-21 23:35Z runtime audit) — ONE status vocabulary per document type, matching the live database.
 * Measured on prod before: A/P "Unpaid" = open/unpaid only (33 of the 177 bills that still owe money — 144 partially_paid hidden);
 * driver-bill "Unpaid" = open only (11 of 184 — 173 'approved' hidden) and the register ignored status / driver / load / date /
 * search for driver bills; "missing driver bill" lists counted voided / exit loads and treated a VOID bill as a bill.
 * STATIC: the backend module and its shared-types twin list the same values; every fixed site reads the module.
 * LIVE (fail closed, read-only, USMCA): driver_bills' CHECK members = DRIVER_BILL_STATUSES; every live accounting.bills status is a
 * member of AP_BILL_STATUSES ∪ AP_BILL_LEGACY_STATUSES. --selftest plants each regression.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

const LABEL = "verify-document-status-vocabulary";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const F = {
  be: "apps/backend/src/lib/document-status-vocabulary.ts",
  fe: "packages/shared-types/src/document-status.ts",
  billsSvc: "apps/backend/src/accounting/bills.service.ts",
  billsRoutes: "apps/backend/src/accounting/bills.routes.ts",
  feFilter: "apps/frontend/src/pages/accounting/billStatusFilter.ts",
  loadsRoutes: "apps/backend/src/mdata/loads.routes.ts",
  exceptions: "apps/backend/src/reports/exception-queue.routes.ts",
};
const read = (rel) => readFileSync(resolve(ROOT, rel), "utf8");
const NAMES = ["AP_BILL_STATUSES", "AP_BILL_LEGACY_STATUSES", "AP_BILL_OUTSTANDING_STATUSES", "DRIVER_BILL_STATUSES", "DRIVER_BILL_OUTSTANDING_STATUSES", "LOAD_STATUSES_WITHOUT_DRIVER_BILL"];
export function listOf(src, name) {
  const m = src.match(new RegExp(`export const ${name} = \\[([^\\]]*)\\]`));
  return m ? [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]) : null;
}
export function check(src = {}) {
  const s = Object.fromEntries(Object.entries(F).map(([k, rel]) => [k, src[k] ?? read(rel)]));
  const f = [];
  for (const n of NAMES) {
    const a = listOf(s.be, n), b = listOf(s.fe, n);
    if (!a || !b) f.push(`${n} missing from ${!a ? F.be : F.fe}`);
    else if (a.join("|") !== b.join("|")) f.push(`${n} drifts: backend [${a}] vs shared-types [${b}]`);
  }
  if (!/where\.push\(`b\.status IN \(\$\{sqlList\(AP_BILL_OUTSTANDING_STATUSES\)\}\)`\)/.test(s.billsSvc)) f.push(`${F.billsSvc}: the "unpaid"/outstanding filter must read AP_BILL_OUTSTANDING_STATUSES`);
  if (!/query\.data\.status === "unpaid"\s*\?\s*\("outstanding" as const\)/.test(s.billsRoutes)) f.push(`${F.billsRoutes}: "Unpaid" must map to outstanding (unpaid + partially_paid), never open-only`);
  if (!/AND \(\$5::text\[\] IS NULL OR db\.status = ANY\(\$5::text\[\]\)\)/.test(s.billsRoutes) || !/driverBillStatusesForFilter\(query\.data\.status\)/.test(s.billsRoutes))
    f.push(`${F.billsRoutes}: the driver-bill register must apply the status filter in the driver-bill vocabulary`);
  if (!/\[\.\.\.DRIVER_BILL_OUTSTANDING_STATUSES\]/.test(s.billsRoutes)) f.push(`${F.billsRoutes}: driver "Unpaid" must be DRIVER_BILL_OUTSTANDING_STATUSES`);
  for (const contract of [
    "$11::text IS NULL OR EXISTS (",
    "register_vendor.operating_company_id = db.operating_company_id",
    "register_vendor.driver_id = db.driver_id",
    "register_vendor.id::text = $11::text OR register_vendor.qbo_vendor_id = $11::text",
    // #27464 (443.287 multi-select filters) appended the unit filter as $12 — vendor stays bound as $11.
    "query.data.vendor_id ?? null, query.data.unit_id ? entityIdFilterValues(query.data.unit_id) : null]",
    "db.created_at AT TIME ZONE '${COMPANY_TIME_ZONE}'",
  ]) if (!s.billsRoutes.includes(contract)) f.push(`${F.billsRoutes}: missing register filter contract: ${contract}`);
  if (!/return bill\.status === "open" \|\| bill\.status === "partial";/.test(s.feFilter) || !/DRIVER_BILL_OUTSTANDING_STATUSES as readonly string\[\]\)\.includes/.test(s.feFilter))
    f.push(`${F.feFilter}: the screen's "Unpaid" predicates must match the vocabulary (partial A/P bills; approved / disputed driver bills)`);
  for (const k of ["loadsRoutes", "exceptions"]) {
    if ((s[k].match(/\$\{loadMissingDriverBillWhereSql\("l"\)\}/g) ?? []).length < 2) f.push(`${F[k]}: the missing-driver-bill lists must use loadMissingDriverBillWhereSql`);
    if (/LEFT JOIN driver_finance\.driver_bills db ON db\.load_id = l\.id[\s\S]{0,400}AND db\.id IS NULL/.test(s[k])) f.push(`${F[k]}: a VOID driver bill still counts as a bill (LEFT JOIN … db.id IS NULL)`);
  }
  return f;
}
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain && process.argv.includes("--selftest")) {
  const base = Object.fromEntries(Object.entries(F).map(([k, rel]) => [k, read(rel)]));
  if (check(base).length) { console.error(`${LABEL} --selftest FAIL: baseline not clean`, check(base)); process.exit(1); }
  const plants = [
    ["vendor ignored", { billsRoutes: base.billsRoutes.replace("$11::text IS NULL OR EXISTS (", "true OR EXISTS (") }],
    ["cross company vendor", { billsRoutes: base.billsRoutes.replace("register_vendor.operating_company_id = db.operating_company_id", "true") }],
    ["wrong vendor driver", { billsRoutes: base.billsRoutes.replace("register_vendor.driver_id = db.driver_id", "true") }],
    ["vendor parameter missing", { billsRoutes: base.billsRoutes.replace("query.data.vendor_id ?? null, query.data.unit_id", "null, query.data.unit_id") }],
    ["UTC date boundary", { billsRoutes: base.billsRoutes.replaceAll("db.created_at AT TIME ZONE '${COMPANY_TIME_ZONE}'", "db.created_at") }],
    ["twin drifts", { fe: base.fe.replace('"open", "approved", "paid", "void", "disputed"', '"open", "paid", "void"') }],
    ["unpaid back to open-only", { billsRoutes: base.billsRoutes.replace('("outstanding" as const)', '("open" as const)') }],
    ["driver register ignores status", { billsRoutes: base.billsRoutes.replace("AND ($5::text[] IS NULL OR db.status = ANY($5::text[]))", "") }],
    ["screen hides approved", { feFilter: base.feFilter.replace("DRIVER_BILL_OUTSTANDING_STATUSES as readonly string[]).includes", "[\"open\"] as readonly string[]).includes") }],
    ["void bill counts as a bill", { exceptions: base.exceptions + "\nconst q = `LEFT JOIN driver_finance.driver_bills db ON db.load_id = l.id\n AND db.id IS NULL`;" }],
  ];
  for (const [n, p] of plants) {
    const k = Object.keys(p)[0];
    if (p[k] === base[k]) { console.error(`${LABEL} --selftest FAIL: plant "${n}" did not apply`); process.exit(1); }
    if (!check({ ...base, ...p }).length) { console.error(`${LABEL} --selftest FAIL: plant "${n}" not caught`); process.exit(1); }
  }
  console.log(`${LABEL} --selftest PASS (${plants.length}/${plants.length})`);
  process.exit(0);
}
if (isMain) {
  const f = check();
  if (f.length) { console.error(`${LABEL}: FAIL (static) —\n  ${f.join("\n  ")}`); process.exit(1); }
  const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
  try {
    await client.query("BEGIN READ ONLY");
    await client.query("SET LOCAL app.bypass_rls = 'lucia'");
    const be = read(F.be);
    const checkDef = (await client.query(`SELECT pg_get_constraintdef(oid) AS d FROM pg_constraint WHERE conrelid = 'driver_finance.driver_bills'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%status = ANY%' AND pg_get_constraintdef(oid) NOT LIKE '%voided_at%'`)).rows.map((r) => r.d)[0] ?? "";
    const checkMembers = [...checkDef.matchAll(/'([a-z_]+)'::text/g)].map((m) => m[1]).sort();
    const vocab = [...listOf(be, "DRIVER_BILL_STATUSES")].sort();
    const apLive = (await client.query(`SELECT DISTINCT status FROM accounting.bills WHERE operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80'`)).rows.map((r) => r.status);
    await client.query("ROLLBACK");
    const apVocab = new Set([...listOf(be, "AP_BILL_STATUSES"), ...listOf(be, "AP_BILL_LEGACY_STATUSES")]);
    const live = [];
    if (checkMembers.join("|") !== vocab.join("|")) live.push(`DRIVER_BILL_STATUSES [${vocab}] ≠ the driver_bills CHECK [${checkMembers}]`);
    for (const st of apLive) if (!apVocab.has(st)) live.push(`live accounting.bills status '${st}' is not in the vocabulary`);
    if (live.length) { console.error(`${LABEL}: FAIL (live) —\n  ${live.join("\n  ")}`); process.exit(1); }
    console.log(`${LABEL}: PASS — vocabularies match their twin, every fixed site reads them; driver_bills CHECK [${checkMembers}] = vocabulary; live A/P statuses [${apLive.sort()}] ⊆ vocabulary`);
  } finally { client.release(); await pool.end().catch(() => {}); }
}
