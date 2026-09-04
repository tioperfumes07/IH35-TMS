#!/usr/bin/env node
// DISPATCH-UI-REFINE-2 ITEM 3 guard: Book Load section B (Equipment·Driver·Trailer) renders a driver
// HOS block bound to the selected driver, sourced from the in-app HOS store (no Samsara call).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const selftest = process.argv.includes("--selftest");
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const fail = (m) => { console.error(`FAIL verify-bookload-section-b-hos: ${m}`); process.exit(1); };
const sec = readFileSync(join(root, "apps/frontend/src/pages/dispatch/components/BookLoadEquipmentSection.tsx"), "utf8");
const modal = readFileSync(join(root, "apps/frontend/src/pages/dispatch/components/BookLoadModalV4.tsx"), "utf8");
const clocks = readFileSync(join(root, "apps/frontend/src/components/dispatch/hos/hosClocks.ts"), "utf8");
if (!/import\s*\{\s*DriverHosClocksBlock\s*\}\s*from\s*"[^"]*hos\/DriverHosClocks"/.test(sec)) fail("must import DriverHosClocksBlock");
if (!/<DriverHosClocksBlock[\s\S]*?driverId=\{primaryDriverId/.test(sec)) fail("section B must render DriverHosClocksBlock bound to the selected primary driver");
if (!/hosOperatingCompanyId/.test(sec)) fail("section B must derive trimmed hosOperatingCompanyId before calling DriverHosClocksBlock");
if (!/operatingCompanyId=\{hosOperatingCompanyId\}/.test(sec)) fail("DriverHosClocksBlock must receive hosOperatingCompanyId, not the raw optional prop");
if (!/effectiveOperatingCompanyId/.test(modal)) fail("BookLoadModalV4 must compute effectiveOperatingCompanyId before wiring section B HOS");
if (!/operatingCompanyId=\{effectiveOperatingCompanyId\}/.test(modal)) fail("BookLoadEquipmentSection must receive effectiveOperatingCompanyId from edit load fallback");
if (!/export function resolveDisplayHosClocks/.test(clocks)) fail("hosClocks must expose resolveDisplayHosClocks for partial certified/in-app merge");
if (!/eld\?\.cycle_remaining_min \?\? row\?\.cycle_remaining_min/.test(clocks)) fail("merge must backfill null certified cycle from in-app cycle_remaining_min");
if (!/assignment_mode|assignmentMode === "team"/.test(sec) || !/secondaryDriverId/.test(sec)) fail("team mode must also show the team driver HOS");
const hosBlockIdx = sec.indexOf('data-testid="book-load-driver-hos"');
const adjIdx = sec.indexOf('data-testid="expected-adjustments"');
if (hosBlockIdx < 0 || adjIdx < 0 || hosBlockIdx > adjIdx) fail("Driver HOS must sit under the driver picker, before expected adjustments");
if (/HOS · detention/.test(sec)) fail("expected adjustments must not bury HOS in its header");
if (/OptimalDriversPanel/.test(sec)) fail("ranked driver suggestions must stay off Book Load section B");
const blk = readFileSync(join(root, "apps/frontend/src/components/dispatch/hos/DriverHosClocks.tsx"), "utf8");
const blockStart = blk.indexOf("export function DriverHosClocksBlock(");
const blockEnd = blk.indexOf("export function DriverHosClockValue(", blockStart);
if (blockStart < 0 || blockEnd < 0) fail("must locate the mounted DriverHosClocksBlock boundary");
const mountedBlock = blk.slice(blockStart, blockEnd);
if (!/getDriverHosStatus/.test(blk)) fail("HOS block must read from the in-app HOS store (getDriverHosStatus, #1109)");
if (!/No HOS data/.test(blk)) fail('HOS block must show "No HOS data" when the store has no events (never fabricate)');
const checks = [
  ["query failures must render a retryable canonical error instead of fallback clocks", /if \(q\.isError\)[\s\S]*?<ListErrorState[\s\S]*?onRetry=\{\(\) => void q\.refetch\(\)\}/],
  ["selected-driver uncertified clocks must be labeled as in-app fallback", /driverId && q\.data[\s\S]*?In-app fallback/],
  ["selected-driver fallback disclosure must say the certified snapshot is unavailable", /Certified ELD snapshot unavailable; showing in-app HOS fallback/],
  ["partial certified clocks must merge via resolveDisplayHosClocks", /resolveDisplayHosClocks\(q\.data\)/],
];
for (const [message, pattern] of checks) if (!pattern.test(mountedBlock)) fail(message);

if (selftest) {
  const mutations = [
    mountedBlock.replace("if (q.isError)", "if (false)"),
    mountedBlock.replace("In-app fallback", "Certified ELD"),
    mountedBlock.replace("Certified ELD snapshot unavailable; showing in-app HOS fallback.", "Clocks loaded."),
    sec.replaceAll("hosOperatingCompanyId", "operatingCompanyId"),
    clocks.replace("eld?.cycle_remaining_min ?? row?.cycle_remaining_min", "eld?.cycle_remaining_min"),
  ];
  for (let index = 0; index < mutations.length; index += 1) {
    if (index < 3) {
      if (checks.every(([, pattern]) => pattern.test(mutations[index]))) fail(`mutation ${index + 1} survived`);
      continue;
    }
    if (index === 3 && /hosOperatingCompanyId/.test(mutations[index])) fail(`mutation ${index + 1} survived`);
    if (index === 4 && /eld\?\.cycle_remaining_min \?\? row\?\.cycle_remaining_min/.test(mutations[index])) fail(`mutation ${index + 1} survived`);
  }
  console.log(`PASS verify-bookload-section-b-hos selftest ${mutations.length}/${mutations.length}`);
} else {
  console.log("PASS verify-bookload-section-b-hos");
}
