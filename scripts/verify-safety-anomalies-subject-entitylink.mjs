#!/usr/bin/env node
/**
 * GUARD 2182 — Integrity Anomalies subject column must EntityLink, never UUID-slice.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-safety-anomalies-subject-entitylink";
const FE = "apps/frontend/src/pages/safety/tabs/AnomaliesTab.tsx";
const DRAWER = "apps/frontend/src/pages/safety/tabs/AnomalyDetailDrawer.tsx";
const ROUTES = "apps/backend/src/integrity/anomaly-status.routes.ts";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function assert(sources) {
  const problems = [];
  const src = sources?.[FE] ?? read(FE);
  const drawer = sources?.[DRAWER] ?? read(DRAWER);
  const routes = sources?.[ROUTES] ?? read(ROUTES);
  if (!/EntityLink/.test(src)) {
    problems.push(`${FE}: missing EntityLink for subject`);
  }
  if (/subject_id\.slice\(0,\s*8\)/.test(src)) {
    problems.push(`${FE}: UUID-slice subject_id label is forbidden`);
  }
  if (!src.includes("row.subject_display_name ?? subjectLabel(row.subject_type)")) {
    problems.push(`${FE}: list subject link must prefer the canonical human projection`);
  }
  if (!drawer.includes("anomaly.subject_display_name")) {
    problems.push(`${DRAWER}: detail subject link must prefer the canonical human projection`);
  }
  for (const marker of ["mdata.drivers d", "mdata.units u", "mdata.customers c", "accounting.invoices i"]) {
    if ((routes.match(new RegExp(marker.replace(".", "\\."), "g")) ?? []).length < 2) {
      problems.push(`${ROUTES}: list and detail must both project ${marker}`);
    }
  }
  if ((routes.match(/d\.operating_company_id = a\.tenant_id/g) ?? []).length < 2 ||
      (routes.match(/c\.operating_company_id = a\.tenant_id/g) ?? []).length < 2 ||
      (routes.match(/i\.operating_company_id = a\.tenant_id/g) ?? []).length < 2) {
    problems.push(`${ROUTES}: human-label joins must remain tenant scoped in list and detail`);
  }
  return problems;
}

if (process.argv.includes("--selftest")) {
  const live = { [FE]: read(FE), [DRAWER]: read(DRAWER), [ROUTES]: read(ROUTES) };
  const liveProblems = assert(live);
  if (liveProblems.length) {
    console.error(`${LABEL} SELFTEST FAIL live:`, liveProblems);
    process.exit(1);
  }
  const planted = assert({ ...live, [FE]: live[FE] + "\n{row.subject_id.slice(0, 8)}\n" });
  if (!planted.some((p) => p.includes("UUID-slice"))) {
    console.error(`${LABEL} SELFTEST FAIL: planted slice not caught`, planted);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS`);
  process.exit(0);
}

const problems = assert();
if (problems.length) {
  console.error(`${LABEL} FAIL:`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — AnomaliesTab subject uses EntityLink, no UUID slice`);
