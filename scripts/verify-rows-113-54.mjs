#!/usr/bin/env node
/**
 * verify-rows-113-54 — register rows 113 (ENG-22 G2) and 54 (Trial balance viewer).
 *
 * ROW 113 LAW: mdata.loads.load_trailer_equipment_id is the trailer TYPE and its FK target is
 * catalogs.load_trailer_equipment (migration 202612511200). Measured on prod 2026-11-03: 198/198 USMCA loads
 * resolve there, 0/198 resolve in catalogs.equipment_types (a different catalog — driver qualification /
 * pay-rate equipment) and 0/198 in mdata.equipment (physical trailers). So:
 *   1. no reader joins load_trailer_equipment_id to mdata.equipment or catalogs.equipment_types;
 *   2. the one INSERT INTO mdata.loads resolves the id through resolveLoadTrailerEquipmentIdForInsert, which
 *      reads catalogs.load_trailer_equipment (never a silent default on a live booking);
 *   3. the FK to the canonical catalog stays in the migration chain.
 *
 * ROW 54 LAW: the trial balance viewer's export is the SAME period the screen shows. The page passes
 * from_date (applied.start) + as_of_date (applied.end); the export route accepts from_date and the export
 * service hands it to getTrialBalanceReport — the one trial-balance query over accounting.journal_entry_postings.
 * Measured on prod 2026-11-03: Q4 screen = $1,628,649.66 / $1,628,649.66 while the as-of export summed
 * all-time = $3,207,785.21 — the file did not tie to the screen.
 *
 * Usage: node scripts/verify-rows-113-54.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-rows-113-54";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

// ---- pure checks -------------------------------------------------------------------------------------------

/** Joins of the trailer TYPE id against a table that is not its catalog. */
export function wrongCatalogJoins(src) {
  const re =
    /(mdata\.equipment|catalogs\.equipment_types)\s+(?:AS\s+)?(\w+)\s+ON\s+\2\.id\s*=\s*\w+\.load_trailer_equipment_id/gi;
  const reverse =
    /(mdata\.equipment|catalogs\.equipment_types)\s+(?:AS\s+)?(\w+)\s+ON\s+\w+\.load_trailer_equipment_id\s*=\s*\2\.id/gi;
  return [...src.matchAll(re), ...src.matchAll(reverse)].map((m) => m[0].replace(/\s+/g, " "));
}

export function checkRow113({ backendFiles, bookLoadSrc, migrationSrc }) {
  const problems = [];
  for (const [file, src] of backendFiles) {
    for (const hit of wrongCatalogJoins(src)) problems.push(`${file}: wrong-catalog join on load_trailer_equipment_id — ${hit}`);
  }
  const inserts = backendFiles.filter(([, src]) => /INSERT\s+INTO\s+mdata\.loads\s*\(/i.test(src)).map(([f]) => f);
  if (inserts.length !== 1 || !inserts[0].endsWith("dispatch/book-load.service.ts")) {
    problems.push(`INSERT INTO mdata.loads must have one door (dispatch/book-load.service.ts); found: ${inserts.join(", ") || "none"}`);
  }
  if (!/loadTrailerEquipmentId\s*=\s*await\s+resolveLoadTrailerEquipmentIdForInsert\(/.test(bookLoadSrc)) {
    problems.push("book-load.service.ts: the insert path no longer resolves load_trailer_equipment_id through resolveLoadTrailerEquipmentIdForInsert");
  }
  const resolverStart = bookLoadSrc.indexOf("export async function resolveLoadTrailerEquipmentIdForInsert(");
  const resolverBody = resolverStart >= 0 ? bookLoadSrc.slice(resolverStart, resolverStart + 6000) : "";
  if (!resolverBody.includes("FROM catalogs.load_trailer_equipment")) {
    problems.push("resolveLoadTrailerEquipmentIdForInsert must read catalogs.load_trailer_equipment");
  }
  if (/FROM\s+catalogs\.equipment_types/.test(resolverBody)) {
    problems.push("resolveLoadTrailerEquipmentIdForInsert reads catalogs.equipment_types — not the FK target");
  }
  if (!/REFERENCES\s+catalogs\.load_trailer_equipment\s*\(/i.test(migrationSrc)) {
    problems.push("migration 202612511200 lost the FK to catalogs.load_trailer_equipment");
  }
  return problems;
}

export function checkRow54({ routesSrc, exportSvcSrc, apiSrc, pageSrc, tbSvcSrc }) {
  const problems = [];
  if (!/const trialBalanceExportQuerySchema = pointInTimeQuerySchema\.extend\(\{\s*from_date:/.test(routesSrc)) {
    problems.push("statement-export.routes.ts: trial-balance export schema does not accept from_date");
  }
  for (const fmt of ["pdf", "xlsx"]) {
    const at = routesSrc.indexOf(`"/api/v1/accounting/trial-balance/export/${fmt}"`);
    const seg = at >= 0 ? routesSrc.slice(at, at + 1800) : "";
    if (!seg.includes("trialBalanceExportQuerySchema.safeParse") || !seg.includes("from_date: query.data.from_date")) {
      problems.push(`trial-balance/export/${fmt} does not parse and pass from_date`);
    }
  }
  const svcAt = exportSvcSrc.indexOf("export async function exportTrialBalanceStatement(");
  const svc = svcAt >= 0 ? exportSvcSrc.slice(svcAt, svcAt + 1500) : "";
  if (!/getTrialBalanceReport\(\{[^}]*from_date:\s*fromDate/.test(svc)) {
    problems.push("exportTrialBalanceStatement does not hand from_date to getTrialBalanceReport (file would not tie to the screen)");
  }
  const apiAt = apiSrc.indexOf("export async function exportTrialBalanceReport(");
  const api = apiAt >= 0 ? apiSrc.slice(apiAt, apiAt + 700) : "";
  if (!api.includes('query.set("from_date", params.from_date)')) problems.push("api/reports.ts exportTrialBalanceReport drops from_date");
  const pagePasses = (pageSrc.match(/exportTrialBalanceReport\(\{\s*operating_company_id: companyId,\s*from_date: applied\.start,\s*as_of_date: applied\.end,/g) ?? []).length;
  if (pagePasses !== 2) problems.push(`TrialBalancePage passes applied.start to ${pagePasses}/2 exports`);
  if (!/target:\s*"register"/.test(pageSrc)) problems.push("TrialBalancePage lost the account-register drill");
  if (!pageSrc.includes("<TrialBalanceBoard") || !pageSrc.includes("getTrialBalanceReport(")) {
    problems.push("TrialBalancePage no longer renders the board from getTrialBalanceReport");
  }
  if (!tbSvcSrc.includes("FROM accounting.journal_entry_postings p") || !/balanced:\s*grandTotalDebits === grandTotalCredits/.test(tbSvcSrc)) {
    problems.push("trial-balance.service.ts must total accounting.journal_entry_postings and set balanced = debits === credits");
  }
  return problems;
}

// ---- inputs ------------------------------------------------------------------------------------------------

function listTs(dir) {
  const out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === "node_modules" || ent.name === "__tests__") continue;
      out.push(...listTs(p));
    } else if (ent.name.endsWith(".ts") && !/\.(test|spec)\.ts$/.test(ent.name)) {
      out.push(p);
    }
  }
  return out;
}

function liveInputs() {
  const backendDir = path.join(ROOT, "apps/backend/src");
  const backendFiles = listTs(backendDir).map((p) => [path.relative(ROOT, p), fs.readFileSync(p, "utf8")]);
  return {
    r113: {
      backendFiles,
      bookLoadSrc: read("apps/backend/src/dispatch/book-load.service.ts"),
      migrationSrc: read("db/migrations/202612511200_p44_load_trailer_equipment_canonical_fk.sql"),
    },
    r54: {
      routesSrc: read("apps/backend/src/accounting/statement-export.routes.ts"),
      exportSvcSrc: read("apps/backend/src/accounting/statement-export.service.ts"),
      apiSrc: read("apps/frontend/src/api/reports.ts"),
      pageSrc: read("apps/frontend/src/pages/reports/TrialBalancePage.tsx"),
      tbSvcSrc: read("apps/backend/src/accounting/trial-balance.service.ts"),
    },
  };
}

// ---- selftest ----------------------------------------------------------------------------------------------

if (process.argv.includes("--selftest")) {
  const live = liveInputs();
  const plantBills = `LEFT JOIN mdata.equipment eq_direct\n  ON eq_direct.id = l.load_trailer_equipment_id`;
  const plantEt = `JOIN catalogs.equipment_types et ON l.load_trailer_equipment_id = et.id`;
  const cases = [
    ["live tree: row 113 clean", checkRow113(live.r113).length === 0],
    ["live tree: row 54 clean", checkRow54(live.r54).length === 0],
    ["plant: mdata.equipment join on the type id is caught",
      checkRow113({ ...live.r113, backendFiles: [...live.r113.backendFiles, ["apps/backend/src/x.ts", plantBills]] }).some((p) => p.includes("x.ts"))],
    ["plant: reversed catalogs.equipment_types join is caught",
      checkRow113({ ...live.r113, backendFiles: [...live.r113.backendFiles, ["apps/backend/src/y.ts", plantEt]] }).some((p) => p.includes("y.ts"))],
    ["plant: second INSERT INTO mdata.loads door is caught",
      checkRow113({ ...live.r113, backendFiles: [...live.r113.backendFiles, ["apps/backend/src/z.ts", "INSERT INTO mdata.loads (id) VALUES ($1)"]] }).some((p) => p.includes("one door"))],
    ["plant: resolver bypassed is caught",
      checkRow113({ ...live.r113, bookLoadSrc: live.r113.bookLoadSrc.replace(/loadTrailerEquipmentId\s*=\s*await\s+resolveLoadTrailerEquipmentIdForInsert\(/g, "loadTrailerEquipmentId = DEFAULT_ID; (") }).length > 0],
    ["plant: resolver reading equipment_types is caught",
      checkRow113({ ...live.r113, bookLoadSrc: live.r113.bookLoadSrc.replace("FROM catalogs.load_trailer_equipment\n        WHERE operating_company_id = $1::uuid AND code = $2", "FROM catalogs.equipment_types\n        WHERE operating_company_id = $1::uuid AND code = $2") }).length > 0],
    ["plant: FK dropped is caught", checkRow113({ ...live.r113, migrationSrc: "-- nothing" }).some((p) => p.includes("FK"))],
    ["plant: export service ignores from_date is caught",
      checkRow54({ ...live.r54, exportSvcSrc: live.r54.exportSvcSrc.replace("from_date: fromDate ?? undefined,", "") }).some((p) => p.includes("tie"))],
    ["plant: route drops from_date is caught",
      checkRow54({ ...live.r54, routesSrc: live.r54.routesSrc.replaceAll("from_date: query.data.from_date ?? null,", "") }).some((p) => p.includes("export/pdf"))],
    ["plant: page exports as-of only is caught",
      checkRow54({ ...live.r54, pageSrc: live.r54.pageSrc.replaceAll("from_date: applied.start,\n", "") }).some((p) => p.includes("0/2"))],
    ["plant: register drill removed is caught",
      checkRow54({ ...live.r54, pageSrc: live.r54.pageSrc.replace('target: "register"', 'target: "nowhere"') }).some((p) => p.includes("register"))],
    ["plant: balanced computed loosely is caught",
      checkRow54({ ...live.r54, tbSvcSrc: live.r54.tbSvcSrc.replace("balanced: grandTotalDebits === grandTotalCredits", "balanced: true") }).length > 0],
  ];
  for (const [n, pass] of cases) console.log(`  ${pass ? "✓" : "✗"} ${n}`);
  const bad = cases.filter(([, p]) => !p).length;
  console.log(bad ? `${LABEL} --selftest FAIL` : `${LABEL} --selftest PASS (${cases.length}/${cases.length})`);
  process.exit(bad ? 1 : 0);
}

// ---- run ---------------------------------------------------------------------------------------------------

const live = liveInputs();
const problems = [...checkRow113(live.r113).map((p) => `[113] ${p}`), ...checkRow54(live.r54).map((p) => `[54] ${p}`)];
if (problems.length) {
  for (const p of problems) console.error(`  ✗ ${p}`);
  console.error(`${LABEL} FAIL (${problems.length})`);
  process.exit(1);
}
console.log(`${LABEL} PASS — 113: 0 wrong-catalog joins, one INSERT door through the canonical resolver, FK present · 54: export = screen period, register drill, totals from journal_entry_postings`);
