#!/usr/bin/env node
/**
 * verify-hos-tracker-staged-filters
 * LV-HOS-TRACKER-FILTER-SILENT-APPLY — HosTrackerSection driver filter must stage via
 * useStagedListFilters with Apply + Cancel + Reset; roster filter uses applied/effectiveDriverId;
 * keep requestedDriverId = searchParams.get("driver_id") + LST-F5171 reverse chrome.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { multiSelectFilterProblems, selftestMultiSelectFilterContract } from "./lib/entity-multiselect-filter-contract.mjs";

const LABEL = "verify-hos-tracker-staged-filters";
const TARGET = "apps/frontend/src/pages/compliance/HosTrackerSection.tsx";

function assertPage(src) {
  const errors = [];
  if (!src.includes("useStagedListFilters")) errors.push("must use useStagedListFilters");
  if (!/onClick=\{staged\.apply\}/.test(src)) errors.push("must wire Apply to staged.apply");
  if (!/onClick=\{staged\.cancel\}/.test(src)) errors.push("must wire Cancel to staged.cancel");
  if (!src.includes('data-testid="hos-tracker-filter-apply"')) errors.push("must expose filter-apply");
  if (!src.includes('data-testid="hos-tracker-filter-cancel"')) errors.push("must expose filter-cancel");
  if (!src.includes('data-testid="hos-tracker-filter-reset"')) errors.push("must expose filter-reset");
  if (!src.includes('dataTestId="hos-tracker-filter-driver"')) errors.push("must keep driver picker testid");
  errors.push(...multiSelectFilterProblems(src, { file: TARGET, kind: "driver", testId: "hos-tracker-filter-driver" }));
  if (!/requestedDriverId\s*=\s*searchParams\.get\("driver_id"\)/.test(src)) {
    errors.push('must keep requestedDriverId = searchParams.get("driver_id")');
  }
  if (!/getHosDailyRoster\(operatingCompanyId, selectedDate, effectiveDriverId\)/.test(src) || !/const effectiveDriverId = applied\.driverId\.trim\(\) \|\| undefined/.test(src) || !/const filteredDrivers = roster\?\.drivers \?\? \[\]/.test(src)) {
    errors.push("must query the scoped roster with all applied driver IDs and render its returned drivers");
  }
  if (!/setSearchParams/.test(src) || !/setDriverFilter/.test(src)) {
    errors.push("must keep setDriverFilter + setSearchParams URL sync");
  }
  if (/const \[driverPickerId,\s*setDriverPickerId\]/.test(src)) {
    errors.push("must not keep hand-rolled silent filter useState");
  }
  errors.push(...leftoverRefuse(src));
  return errors;
}

function leftoverRefuse(src) {
  const hits = [];
  if (src.includes("text-[11px]")) hits.push(`${TARGET}: leftover text-[11px]`);
  if (
    src.includes("#8A92AB") ||
    src.includes("#334155") ||
    src.includes("#64748b") ||
    src.includes("#475569") ||
    src.includes("#94a3b8") ||
    src.includes("#94A3B8")
  ) {
    hits.push(`${TARGET}: leftover off-scale muted`);
  }
  if (src.includes("text-slate-") || src.includes("border-slate-") || src.includes("bg-slate-")) {
    hits.push(`${TARGET}: leftover slate class`);
  }
  return hits;
}

function selftest() {
  const bad = `
    const requestedDriverId = searchParams.get("driver_id");
    const [driverPickerId, setDriverPickerId] = useState("");
    const setDriverFilter = (driverId) => { setDriverPickerId(driverId); setSearchParams(...); };
    driver.driver_id === effectiveDriverId
    filteredDrivers
  `;
  const good = fs.readFileSync(path.join(process.cwd(), TARGET), "utf8");
  selftestMultiSelectFilterContract();
  for (const [from, to] of [
    ['kind="driver"', 'kind="driver" allowCreate'],
    ['operatingCompanyId={operatingCompanyId}', 'operatingCompanyId={""}'],
    ['setDriverFilter(next ?? "")', 'setDriverFilter(next?.split(",")[0] ?? "")'],
    ['getHosDailyRoster(operatingCompanyId, selectedDate, effectiveDriverId)', 'getHosDailyRoster(operatingCompanyId, selectedDate, undefined)'],
    ['applied.driverId.trim()', 'applied.driverId.split(",")[0].trim()'],
    ['onClick={staged.apply}', 'onClick={() => undefined}'],
    ['onClick={staged.cancel}', 'onClick={() => undefined}'],
  ]) {
    if (!good.includes(from)) throw new Error(`selftest plant did not change source: ${from}`);
    if (!assertPage(good.replaceAll(from, to)).length) throw new Error(`selftest plant survived: ${from}`);
  }
  if (assertPage(bad).length === 0 || assertPage(good).length > 0) {
    console.error(`${LABEL} SELFTEST FAIL`, { bad: assertPage(bad), good: assertPage(good) });
    process.exit(1);
  }
  const leftoverHits = leftoverRefuse('style={{ background: driver.available ? dot : "#94A3B8" }}');
  if (!leftoverHits.some((h) => h.includes("leftover off-scale muted"))) {
    console.error(`${LABEL} SELFTEST FAIL leftover #94A3B8 plant escaped`);
    process.exit(1);
  }
  const leftoverSlateClass = leftoverRefuse('<div className="text-slate-700 border-slate-200 bg-slate-100">plant</div>');
  if (!leftoverSlateClass.some((h) => h.includes("leftover slate class"))) {
    console.error(`${LABEL} SELFTEST FAIL leftover slate class plant escaped`);
    process.exit(1);
  }
  console.log(`${LABEL} selftest PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const errors = assertPage(fs.readFileSync(path.join(process.cwd(), TARGET), "utf8"));
if (errors.length) {
  console.error(`${LABEL} FAIL:`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — hos tracker staged filters`);
