#!/usr/bin/env node
/**
 * verify-fault-drafts-staged-filters
 * LV-FAULT-DRAFTS-FILTER-SILENT-APPLY — FaultDraftsPage unit filter must stage via
 * useStagedListFilters with Apply + Cancel + Reset; client filter uses applied/effectiveUnitId;
 * keep deepLinkUnitId = searchParams.get("unit_id") for entitylink + maintenance reverse siblings.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LABEL = "verify-fault-drafts-staged-filters";
const TARGET = "apps/frontend/src/pages/maintenance/FaultDraftsPage.tsx";

function assertPage(src) {
  const errors = [];
  if (!src.includes("useStagedListFilters")) errors.push("must use useStagedListFilters");
  if (!/onClick=\{staged\.apply\}/.test(src)) errors.push("must wire Apply to staged.apply");
  if (!/onClick=\{staged\.cancel\}/.test(src)) errors.push("must wire Cancel to staged.cancel");
  if (!src.includes('data-testid="fault-drafts-filter-apply"')) errors.push("must expose filter-apply");
  if (!src.includes('data-testid="fault-drafts-filter-cancel"')) errors.push("must expose filter-cancel");
  if (!src.includes('data-testid="fault-drafts-filter-reset"')) errors.push("must expose filter-reset");
  if (!src.includes('dataTestId="fault-drafts-filter-unit"')) errors.push("must keep unit picker testid");
  if (!/allowCreate=\{false\}/.test(src)) errors.push("must keep allowCreate={false}");
  if (!/const deepLinkUnitId\s*=\s*searchParams\.get\("unit_id"\)/.test(src)) {
    errors.push('must keep deepLinkUnitId = searchParams.get("unit_id")');
  }
  if (!/effectiveUnitId/.test(src) || !/applied\.unitId/.test(src)) {
    errors.push("filter must use applied/effectiveUnitId");
  }
  if (!/setSearchParams/.test(src) || !/setUnitFilter/.test(src)) {
    errors.push("must keep setUnitFilter + setSearchParams URL sync");
  }
  if (/const \[unitPickerId,\s*setUnitPickerId\]/.test(src)) {
    errors.push("must not keep hand-rolled silent filter useState");
  }
  if (!/<ListErrorState[\s\S]*?Couldn't load fault-driven drafts[\s\S]*?onRetry=\{\(\) => void draftsQuery\.refetch\(\)\}/.test(src)) {
    errors.push("failed fault-drafts read must expose an exact-query retry");
  }
  if (!/!draftsQuery\.isError \? <ParityTable[\s\S]*?\/> : null/.test(src)) {
    errors.push("failed fault-drafts read must not mount a misleading empty table");
  }
  return errors;
}

function selftest() {
  const production = fs.readFileSync(path.join(process.cwd(), TARGET), "utf8");
  const retryNeedle = "onRetry={() => void draftsQuery.refetch()}";
  if (!production.includes(retryNeedle)) {
    console.error(`${LABEL} SELFTEST FAIL: production retry fixture drift`);
    process.exit(1);
  }
  const retryMutation = production.replace(retryNeedle, "onRetry={() => undefined}");
  if (!assertPage(retryMutation).some((error) => error.includes("exact-query retry"))) {
    console.error(`${LABEL} SELFTEST FAIL: retry no-op mutation survived`);
    process.exit(1);
  }
  const bad = `
    const deepLinkUnitId = searchParams.get("unit_id");
    const [unitPickerId, setUnitPickerId] = useState("");
    const setUnitFilter = (unitId) => { setUnitPickerId(unitId); setSearchParams(...); };
  `;
  const good = `
    useStagedListFilters({ applied, empty: EMPTY_FILTERS, onApply })
    const deepLinkUnitId = searchParams.get("unit_id");
    const effectiveUnitId = applied.unitId.trim() || undefined;
    const setUnitFilter = (unitId) => { staged.setDraft((d) => ({ ...d, unitId })); };
    setSearchParams
    allowCreate={false}
    dataTestId="fault-drafts-filter-unit"
    <button data-testid="fault-drafts-filter-apply" onClick={staged.apply}>Apply</button>
    <button data-testid="fault-drafts-filter-cancel" onClick={staged.cancel}>Cancel</button>
    <button data-testid="fault-drafts-filter-reset">Reset</button>
    <ListErrorState title="Couldn't load fault-driven drafts" onRetry={() => void draftsQuery.refetch()} />
    {!draftsQuery.isError ? <ParityTable /> : null}
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
console.log(`${LABEL} PASS — fault drafts staged filters`);
