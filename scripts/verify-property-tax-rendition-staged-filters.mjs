#!/usr/bin/env node
/**
 * verify-property-tax-rendition-staged-filters
 * LV-COMPLIANCE-PROPERTY-TAX-FILTER-SILENT-APPLY — PropertyTaxRenditionPage unit filter
 * must stage via useStagedListFilters with Apply + Cancel + Reset; query uses applied/effectiveUnitId;
 * URL sync on Apply.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LABEL = "verify-property-tax-rendition-staged-filters";
const TARGET = "apps/frontend/src/pages/compliance/PropertyTaxRenditionPage.tsx";

function assertPage(src) {
  const errors = [];
  if (!src.includes("useStagedListFilters")) errors.push("must use useStagedListFilters");
  if (!src.includes('data-testid="property-tax-filter-apply"')) errors.push("must expose filter-apply");
  if (!src.includes('data-testid="property-tax-filter-cancel"')) errors.push("must expose filter-cancel");
  if (!src.includes('data-testid="property-tax-filter-reset"')) errors.push("must expose filter-reset");
  if (!src.includes('data-testid="property-tax-filters"')) errors.push("must keep filters chrome");
  if (!src.includes('dataTestId="property-tax-filter-unit"')) errors.push("must keep unit picker testid");
  if (!/effectiveUnitId/.test(src)) errors.push("must keep effectiveUnitId for reverse-section sibling");
  if (!/searchParams\.get\("unit_id"\)/.test(src)) errors.push("must read unit_id from URL");
  if (/const \[unitFilter,\s*setUnitFilterState\]/.test(src)) {
    errors.push("must not keep hand-rolled silent filter useState");
  }
  if (!/onApplyFilters/.test(src) || !/onCancelFilters/.test(src)) {
    errors.push("must wire Apply/Cancel through list view");
  }
  return errors;
}

function selftest() {
  const bad = `
    const [unitFilter, setUnitFilterState] = useState("");
    const setUnitFilter = (next) => { setUnitFilterState(next); setSearchParams(...); };
  `;
  const good = `
    useStagedListFilters({ applied, empty: EMPTY_FILTERS, onApply })
    const effectiveUnitId = applied.unitId.trim() || undefined;
    searchParams.get("unit_id")
    dataTestId="property-tax-filter-unit"
    data-testid="property-tax-filters"
    data-testid="property-tax-filter-apply"
    data-testid="property-tax-filter-cancel"
    data-testid="property-tax-filter-reset"
    onApplyFilters
    onCancelFilters
  `;
  if (assertPage(bad).length === 0 || assertPage(good).length > 0) {
    console.error(`${LABEL} SELFTEST FAIL`, { bad: assertPage(bad), good: assertPage(good) });
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
console.log(`${LABEL} PASS — property tax rendition staged filters`);
