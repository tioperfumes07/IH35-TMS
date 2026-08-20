#!/usr/bin/env node
/** @matrix-built {"modules":["compliance","drivers"],"cols":["unit","connectivity","reverse_link"],"leafRe":"^tab\\.hos_tracker$|^profiles\\.hos_detail$","task":"DRV-HOS-TIMELINE-UNIT-DEAD-DRILL","vertical":"column-wave"} */
/**
 * LINK-F5171 — compliance HOS tracker detail drawer + ELD live-duty unit column must
 * EntityLink unit_id (roster already returns it; detail subtitle used entityLabel(..., null)).
 *
 * Run: node scripts/verify-hos-unit-entitylink.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-hos-unit-entitylink";
const HOS = "apps/frontend/src/pages/compliance/HosTrackerSection.tsx";
const ELD = "apps/frontend/src/pages/eld/tabs/LiveDutyTab.tsx";
const DRIVER_HOS = "apps/frontend/src/pages/drivers/DriverHosDetailPage.tsx";
const DRIVER_HOS_API = "apps/frontend/src/api/hos.ts";
const DRIVER_HOS_ROUTE = "apps/backend/src/telematics/hos.routes.ts";
const ROUTES = "apps/frontend/src/routes/manifest.tsx";

function audit(hosSrc, eldSrc, driverHosSrc, driverHosApiSrc, driverHosRouteSrc, routesSrc) {
  const failures = [];
  if (/entityLabel\(selectedDriver\.unit_number,\s*null/.test(hosSrc)) {
    failures.push(`${HOS}: detail subtitle still entityLabel(unit, null)`);
  }
  if (!/data-testid=["']hos-tracker-detail-unit-link["']/.test(hosSrc)) {
    failures.push(`${HOS}: missing data-testid=hos-tracker-detail-unit-link`);
  }
  // Detail (not the table column) must bind selectedDriver.unit_id with kind=unit.
  if (!/kind=["']unit["'][\s\S]{0,80}id=\{selectedDriver\.unit_id\}/.test(hosSrc)) {
    failures.push(`${HOS}: detail must EntityLink kind=unit with selectedDriver.unit_id`);
  }
  if (/entityLabel\(row\.unit_number,\s*null/.test(eldSrc)) {
    failures.push(`${ELD}: unit column still entityLabel(..., null)`);
  }
  if (!/data-testid=["']eld-live-duty-unit-link["']/.test(eldSrc)) {
    failures.push(`${ELD}: missing data-testid=eld-live-duty-unit-link`);
  }
  if (!/kind=["']unit["'][\s\S]{0,80}id=\{row\.unit_id\}/.test(eldSrc)) {
    failures.push(`${ELD}: unit column must EntityLink kind=unit with row.unit_id`);
  }
  if (!/path=["']\/drivers\/:id\/hos["'][\s\S]{0,220}<DriverHosDetailPage\s*\/>/.test(routesSrc)) {
    failures.push(`${ROUTES}: mounted /drivers/:id/hos route must render DriverHosDetailPage`);
  }
  if (!/unit_id:\s*string\s*\|\s*null;[\s\S]{0,80}unit_number:\s*string\s*\|\s*null;/.test(driverHosApiSrc)) {
    failures.push(`${DRIVER_HOS_API}: HOS event contract must carry unit_id + unit_number`);
  }
  if (!/LEFT JOIN mdata\.units u[\s\S]{0,160}u\.id = e\.unit_id[\s\S]{0,180}COALESCE\(u\.currently_leased_to_company_id, u\.owner_company_id\) = e\.operating_company_id/.test(driverHosRouteSrc)) {
    failures.push(`${DRIVER_HOS_ROUTE}: timeline producer must tenant-scope the unit label join`);
  }
  if (!/e\.unit_id::text,[\s\S]{0,50}u\.unit_number/.test(driverHosRouteSrc)) {
    failures.push(`${DRIVER_HOS_ROUTE}: timeline producer must return unit_id + human unit_number`);
  }
  if (!/data-testid=\{`driver-hos-event-unit-\$\{event\.id\}`\}/.test(driverHosSrc)) {
    failures.push(`${DRIVER_HOS}: missing per-event unit drill test id`);
  }
  if (!/<EntityLinkOrTombstone[\s\S]{0,120}kind=["']unit["'][\s\S]{0,100}id=\{event\.unit_id\}[\s\S]{0,100}name=\{event\.unit_number\}/.test(driverHosSrc)) {
    failures.push(`${DRIVER_HOS}: timeline unit must tombstone-safe drill by event.unit_id with human unit_number`);
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const hos = fs.readFileSync(path.join(ROOT, HOS), "utf8");
  const eld = fs.readFileSync(path.join(ROOT, ELD), "utf8");
  const driverHos = fs.readFileSync(path.join(ROOT, DRIVER_HOS), "utf8");
  const driverHosApi = fs.readFileSync(path.join(ROOT, DRIVER_HOS_API), "utf8");
  const driverHosRoute = fs.readFileSync(path.join(ROOT, DRIVER_HOS_ROUTE), "utf8");
  const routes = fs.readFileSync(path.join(ROOT, ROUTES), "utf8");
  if (audit(hos, eld, driverHos, driverHosApi, driverHosRoute, routes).length) {
    console.error(`${LABEL} SELFTEST FAIL — live files should pass`);
    process.exit(1);
  }
  const brokenHos = hos.replace(/kind=["']unit["']([\s\S]{0,80}id=\{selectedDriver\.unit_id\})/, 'kind="driver"$1');
  if (!audit(brokenHos, eld, driverHos, driverHosApi, driverHosRoute, routes).length) {
    console.error(`${LABEL} SELFTEST FAIL — planted HOS detail kind regression not caught`);
    process.exit(1);
  }
  const brokenEld = eld.replace(/kind=["']unit["']([\s\S]{0,80}id=\{row\.unit_id\})/, 'kind="driver"$1');
  if (!audit(hos, brokenEld, driverHos, driverHosApi, driverHosRoute, routes).length) {
    console.error(`${LABEL} SELFTEST FAIL — planted ELD unit kind regression not caught`);
    process.exit(1);
  }
  const mutations = [
    ["frontend-link", driverHos.replace(/id=\{event\.unit_id\}/, "id={null}")],
    ["frontend-label", driverHos.replace(/name=\{event\.unit_number\}/, "name={null}")],
    ["producer-label", driverHosRoute.replace(/u\.unit_number,/, "NULL::text AS unit_number,")],
    ["producer-scope", driverHosRoute.replace(/COALESCE\(u\.currently_leased_to_company_id, u\.owner_company_id\) = e\.operating_company_id/, "TRUE")],
    ["mounted-route", routes.replace(/<DriverHosDetailPage\s*\/>/, "<div />")],
  ];
  for (const [name, mutated] of mutations) {
    const sources = { driverHos, driverHosRoute, routes, [name === "producer-label" || name === "producer-scope" ? "driverHosRoute" : name === "mounted-route" ? "routes" : "driverHos"]: mutated };
    if (!audit(hos, eld, sources.driverHos, driverHosApi, sources.driverHosRoute, sources.routes).length) {
      console.error(`${LABEL} SELFTEST FAIL — planted ${name} regression not caught`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} --selftest OK — 7 planted regressions caught`);
  process.exit(0);
}

const hos = fs.readFileSync(path.join(ROOT, HOS), "utf8");
const eld = fs.readFileSync(path.join(ROOT, ELD), "utf8");
const driverHos = fs.readFileSync(path.join(ROOT, DRIVER_HOS), "utf8");
const driverHosApi = fs.readFileSync(path.join(ROOT, DRIVER_HOS_API), "utf8");
const driverHosRoute = fs.readFileSync(path.join(ROOT, DRIVER_HOS_ROUTE), "utf8");
const routes = fs.readFileSync(path.join(ROOT, ROUTES), "utf8");
const failures = audit(hos, eld, driverHos, driverHosApi, driverHosRoute, routes);
if (failures.length) {
  console.error(`${LABEL} FAIL:`);
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}
console.log(`${LABEL} PASS — HOS tracker + ELD live-duty + mounted driver HOS timeline unit drills`);
