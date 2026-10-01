#!/usr/bin/env node
/**
 * C-57 Driver Profile Integrity + Complaints KPIs (Cursor lane — scripts/ops/).
 * Asserts: Integrity + Complaints tiles on /drivers/profiles shell + DriverProfilePage;
 * component evidence table uses ParityTable (lines on rows); consumes driver-profiles API.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const LABEL = "verify-c57-driver-profile-integrity-kpis";
const SELFTEST = process.argv.includes("--selftest");

const FILES = {
  api: "apps/frontend/src/api/driver-integrity.ts",
  strip: "apps/frontend/src/components/drivers/DriverProfilesIntegrityKpiStrip.tsx",
  section: "apps/frontend/src/components/drivers/DriverIntegritySection.tsx",
  drivers: "apps/frontend/src/pages/Drivers.tsx",
  profile: "apps/frontend/src/pages/drivers/DriverProfilePage.tsx",
  table: "apps/frontend/src/pages/drivers/DriversTable.tsx",
  list: "apps/frontend/src/pages/drivers/DriversListPage.tsx",
};

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function audit() {
  const f = [];
  const api = read(FILES.api);
  if (!/\/api\/v1\/maintenance\/integrity\/driver-profiles/.test(api)) {
    f.push(`${FILES.api}: must call GET /api/v1/maintenance/integrity/driver-profiles`);
  }
  if (!/countedComplaints/.test(api)) {
    f.push(`${FILES.api}: countedComplaints helper missing`);
  }

  const strip = read(FILES.strip);
  if (!/Integrity findings/.test(strip) || !/Complaints/.test(strip)) {
    f.push(`${FILES.strip}: Integrity findings + Complaints KPI labels required`);
  }
  if (!/KpiStrip/.test(strip) || !/KpiCard/.test(strip)) {
    f.push(`${FILES.strip}: tiles must use KpiStrip/KpiCard (tiles across, not bars)`);
  }

  const section = read(FILES.section);
  if (!/ParityTable/.test(section)) {
    f.push(`${FILES.section}: component evidence must use ParityTable (lines on rows)`);
  }
  if (!/driver-integrity-section/.test(section)) {
    f.push(`${FILES.section}: data-testid driver-integrity-section missing`);
  }

  const drivers = read(FILES.drivers);
  if (!/DriverProfilesIntegrityKpiStrip/.test(drivers)) {
    f.push(`${FILES.drivers}: profiles shell must mount DriverProfilesIntegrityKpiStrip`);
  }
  if (!/data-c57-profiles/.test(drivers)) {
    f.push(`${FILES.drivers}: data-c57-profiles marker missing on profiles shell`);
  }

  const profile = read(FILES.profile);
  if (!/Integrity findings/.test(profile) || !/label=\"Complaints\"/.test(profile)) {
    f.push(`${FILES.profile}: Overview KPI strip must include Integrity findings + Complaints tiles`);
  }
  if (!/DriverIntegritySection/.test(profile)) {
    f.push(`${FILES.profile}: Overview must mount DriverIntegritySection`);
  }
  const navIdx = profile.indexOf("NavyPageSubNav");
  const kpiIdx = profile.indexOf("driver-profile-kpi-strip");
  if (navIdx < 0 || kpiIdx < 0 || navIdx > kpiIdx) {
    f.push(`${FILES.profile}: C-11 KPIs must stay below NavyPageSubNav`);
  }

  const table = read(FILES.table);
  if (!/integrity_findings/.test(table) || !/complaints_count/.test(table)) {
    f.push(`${FILES.table}: list columns Integrity findings + Complaints required`);
  }

  const list = read(FILES.list);
  if (!/listDriverIntegrityProfiles/.test(list)) {
    f.push(`${FILES.list}: must load integrity profiles for list columns`);
  }

  return f;
}

if (SELFTEST) {
  const failures = audit();
  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAIL:`);
    for (const x of failures) console.error(`  - ${x}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS`);
  process.exit(0);
}

const failures = audit();
if (failures.length) {
  console.error(`${LABEL} FAIL:`);
  for (const x of failures) console.error(`  - ${x}`);
  process.exit(1);
}
console.log(`${LABEL}: OK — C-57 Integrity + Complaints KPIs on /drivers/profiles`);
process.exit(0);
