#!/usr/bin/env node
/**
 * verify-team-split-config-staged-filters
 * LV-DRIVERS-TEAM-SPLIT-FILTER-SILENT-APPLY — TeamSplitConfig driver filter must stage via
 * useStagedListFilters with Apply + Cancel + Reset; list filter uses applied driverId;
 * LST-F5185 URL sync on Apply.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LABEL = "verify-team-split-config-staged-filters";
const TARGET = "apps/frontend/src/pages/drivers/TeamSplitConfig.tsx";
const HOOK = 'apps/frontend/src/hooks/useTeamSplits.ts';
const ROUTE = 'apps/backend/src/settlements/team-splits/team-splits.routes.ts';

function assertPage(src, hook = fs.readFileSync(HOOK,'utf8'), route = fs.readFileSync(ROUTE,'utf8')) {
  const errors = [];
  if (!src.includes("useStagedListFilters")) errors.push("must use useStagedListFilters");
  if (!/onClick=\{staged\.apply\}/.test(src)) errors.push("must wire Apply to staged.apply");
  if (!/onClick=\{staged\.cancel\}/.test(src)) errors.push("must wire Cancel to staged.cancel");
  if (!src.includes('data-testid="team-split-config-filter-apply"')) errors.push("must expose filter-apply");
  if (!src.includes('data-testid="team-split-config-filter-cancel"')) errors.push("must expose filter-cancel");
  if (!src.includes('data-testid="team-split-config-filter-reset"')) errors.push("must expose filter-reset");
  if (!src.includes('dataTestId="team-split-config-filter-driver"')) errors.push("must keep driver picker testid");
  if (!src.includes('useTeamSplits(operatingCompanyId, driverId || undefined)') || !hook.includes('driver_id: driverFilter') || !hook.includes('params.set("driver_id", filters.driver_id)') || !hook.includes('operatingCompanyId, driverFilter ?? ""')) {
    errors.push("must keep applied driver selection in scoped query/cache and API request");
  }
  if (!route.includes('driver_id: entityIdFilterSchema.optional()') || !route.includes('values.push(entityIdFilterValues(query.data.driver_id))') || !route.includes('(t.primary_driver_id = ANY($${values.length}::uuid[]) OR t.secondary_driver_id = ANY($${values.length}::uuid[]))')) errors.push('server must include either primary or secondary selected driver via bound UUID array');
  if (!route.includes('WHERE t.operating_company_id = $1::uuid')) errors.push('server team selection must remain company scoped');
  if (!src.includes('row.status === "active"') || !src.includes('!teamId || row.id === teamId')) errors.push('must retain active status and exact team reverse drill');
  if (!/setSearchParams/.test(src) || !/searchParams\.get\("driver_id"\)/.test(src) || !/setDriverId/.test(src)) {
    errors.push("must keep LST-F5185 setDriverId + setSearchParams URL sync");
  }
  if (/function setDriverId\(next: string\) \{\s*const p = new URLSearchParams/.test(src)) {
    errors.push("must not silent-apply URL inside setDriverId");
  }
  return errors;
}

function selftest() {
  const bad = `
    function setDriverId(next: string) {
      const p = new URLSearchParams(searchParams);
      setSearchParams(p, { replace: true });
    }
    const driverId = searchParams.get("driver_id")
  `;
  const good = fs.readFileSync(TARGET,'utf8');
  if (assertPage(bad).length === 0 || assertPage(good).length > 0) {
    console.error(`${LABEL} SELFTEST FAIL`, { bad: assertPage(bad), good: assertPage(good) });
    process.exit(1);
  }
  const route = fs.readFileSync(ROUTE,'utf8');
  for (const marker of ['t.primary_driver_id = ANY', 't.secondary_driver_id = ANY', 'values.push(entityIdFilterValues(query.data.driver_id))', 'driver_id: entityIdFilterSchema.optional()', 'WHERE t.operating_company_id = $1::uuid']) {
    if (!route.includes(marker) || !assertPage(good, fs.readFileSync(HOOK,'utf8'), route.replace(marker,'REMOVED')).length) throw new Error(`escaped server selection plant: ${marker}`);
  }
  for (const marker of ['onClick={staged.apply}', 'onClick={staged.cancel}', 'useTeamSplits(operatingCompanyId, driverId || undefined)', 'row.status === "active"', '!teamId || row.id === teamId']) if (!assertPage(good.replace(marker,'REMOVED')).length) throw new Error(`escaped page plant: ${marker}`);
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
console.log(`${LABEL} PASS — team split config staged filters`);
