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

// LEAD 443.99 class B (2026-10-12) — where the profile's tab strip lives.
//   old rule: DriverProfilePage renders <NavyPageSubNav> and it precedes driver-profile-kpi-strip.
//   new rule: DriverProfilePage renders <DriverOverviewBoard ... hideChrome> before driver-profile-kpi-strip, and
//             DriverOverviewBoard renders <ProfileTabStrip> in its hideChrome branch (the tab strip).
//   why: DRV-F420 (#25517, 2026f27d5a) replaced the profile's NavyPageSubNav with DriverOverviewBoard's
//        ProfileTabStrip (the approved DriverDetail tabs). Tabs-first (C-11/D11) is unchanged and still enforced.
const BOARD_FILE = "apps/frontend/src/components/boards/DriverOverviewBoard.tsx";
export function tabsFirstFailures(profile, board) {
  const f = [];
  const stripIdx = profile.search(/<DriverOverviewBoard\b[^>]*\bhideChrome\b/);
  const kpiIdx = profile.indexOf("driver-profile-kpi-strip");
  if (!/props\.hideChrome \? \(?\s*<ProfileTabStrip\b/.test(board)) f.push(`${BOARD_FILE}: hideChrome board must render the ProfileTabStrip`);
  if (stripIdx < 0 || kpiIdx < 0 || stripIdx > kpiIdx) f.push("DriverProfilePage: C-11 KPIs must render below the tab strip (DriverOverviewBoard hideChrome) — tabs first");
  return f;
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
  for (const x of tabsFirstFailures(profile, read(BOARD_FILE))) f.push(`${FILES.profile}: ${x}`);

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
  // 443.99 — planted tabs-first violations must be caught (the old selftest only re-ran the audit).
  const profileSrc = read(FILES.profile);
  const boardSrc = read(BOARD_FILE);
  const kpiFirst = profileSrc.replace(/<DriverOverviewBoard\b[^>]*\bhideChrome\b/, "<DriverOverviewBoard").replace('data-testid="driver-profile-kpi-strip"', 'data-testid="driver-profile-kpi-strip" /* <DriverOverviewBoard hideChrome */');
  const plants = [
    ["KPI band above the tab strip", tabsFirstFailures(profileSrc.replace(/<DriverOverviewBoard\b[^>]*\bhideChrome\b[^>]*\/>/, ""), boardSrc)],
    ["board renders no tab strip", tabsFirstFailures(profileSrc, boardSrc.replaceAll("<ProfileTabStrip", "<NoStrip"))],
    ["strip mounted after the KPI band", tabsFirstFailures(kpiFirst, boardSrc)],
  ];
  const escaped = plants.filter(([, f]) => f.length === 0).map(([n]) => n);
  if (escaped.length) {
    console.error(`${LABEL} SELFTEST FAIL — planted violation escaped: ${escaped.join(", ")}`);
    process.exit(1);
  }
  const failures = audit();
  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAIL:`);
    for (const x of failures) console.error(`  - ${x}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — ${plants.length}/${plants.length} planted tabs-first violations caught`);
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
