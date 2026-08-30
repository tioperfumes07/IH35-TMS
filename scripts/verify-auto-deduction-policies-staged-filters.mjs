#!/usr/bin/env node
/**
 * verify-auto-deduction-policies-staged-filters
 * LV-DRIVERS-AUTO-DEDUCTION-FILTER-SILENT-APPLY — AutoDeductionPoliciesPanel driver filter
 * must stage via useStagedListFilters with Apply + Cancel + Reset; list scoped to applied.*;
 * LST-F5184 URL sync on Apply.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LABEL = "verify-auto-deduction-policies-staged-filters";
const TARGET = "apps/frontend/src/pages/drivers/AutoDeductionPolicies.tsx";

function assertPage(src) {
  const errors = [];
  if (!src.includes("useStagedListFilters")) errors.push("must use useStagedListFilters");
  if (!/onClick=\{staged\.apply\}/.test(src)) errors.push("must wire Apply to staged.apply");
  if (!/onClick=\{staged\.cancel\}/.test(src)) errors.push("must wire Cancel to staged.cancel");
  if (!src.includes('data-testid="auto-deduction-policies-filter-apply"')) errors.push("must expose filter-apply");
  if (!src.includes('data-testid="auto-deduction-policies-filter-cancel"')) errors.push("must expose filter-cancel");
  if (!src.includes('data-testid="auto-deduction-policies-filter-reset"')) errors.push("must expose filter-reset");
  if (!src.includes('dataTestId="auto-deduction-policies-filter-driver"')) errors.push("must keep driver picker testid");
  if (!/effectiveDriverId/.test(src) || !/applied\.driverId/.test(src)) {
    errors.push("list must use applied/effectiveDriverId (not silent URL-only)");
  }
  if (!/setSearchParams/.test(src) || !/searchParams\.get\("driver_id"\)/.test(src) || !/setDriverFilter/.test(src)) {
    errors.push("must keep LST-F5184 setDriverFilter + setSearchParams URL sync");
  }
  if (/function setDriverFilter\(next: string\) \{\s*const p = new URLSearchParams/.test(src)) {
    errors.push("must not silent-apply URL inside setDriverFilter");
  }

  // DRV-MONEY-F7449 — a read failure was previously indistinguishable from "no active policies", and
  // React Query's retained `data` could leave stale actionable Pause/Cancel/Resume rows rendered
  // against a read the app no longer vouches for. Fail-loud + suppress rows, never a silent empty.
  if (!/policiesQuery\.isError/.test(src)) {
    errors.push("must branch on policiesQuery.isError (a failed read must not render as an honest empty list)");
  }
  if (!/<ListErrorState[\s\S]{0,200}onRetry=\{\(\) => void policiesQuery\.refetch\(\)\}/.test(src)) {
    errors.push("must render ListErrorState wired to policiesQuery.refetch() on error");
  }
  if (!/const rows = policiesQuery\.isError \? \[\] : \(policiesQuery\.data\?\.rows \?\? \[\]\);/.test(src)) {
    errors.push("grouped rows must be suppressed (not just the empty-state text) while the read is erroring — stale Pause/Cancel/Resume rows must not render");
  }
  return errors;
}

function selftest() {
  const bad = `
    function setDriverFilter(next: string) {
      const p = new URLSearchParams(searchParams);
      setSearchParams(p, { replace: true });
    }
    value={deepLinkDriverId}
  `;
  const good = `
    useStagedListFilters({ applied, empty: EMPTY_FILTERS, onApply })
    const effectiveDriverId = applied.driverId.trim() || undefined;
    function setDriverFilter(next: string) { staged.setDraft((d) => ({ ...d, driverId: next })); }
    searchParams.get("driver_id")
    setSearchParams
    dataTestId="auto-deduction-policies-filter-driver"
    <button data-testid="auto-deduction-policies-filter-apply" onClick={staged.apply}>Apply</button>
    <button data-testid="auto-deduction-policies-filter-cancel" onClick={staged.cancel}>Cancel</button>
    <button data-testid="auto-deduction-policies-filter-reset">Reset</button>
    const rows = policiesQuery.isError ? [] : (policiesQuery.data?.rows ?? []);
    {policiesQuery.isError ? (
      <ListErrorState title="x" status={0} message={y} onRetry={() => void policiesQuery.refetch()} />
    ) : null}
  `;
  if (assertPage(bad).length === 0 || assertPage(good).length > 0) {
    console.error(`${LABEL} SELFTEST FAIL`, { bad: assertPage(bad), good: assertPage(good) });
    process.exit(1);
  }

  // DRV-MONEY-F7449 planted regressions: each mutation removes ONE piece of the fix from an
  // otherwise-good fixture and must independently fail.
  const mutations = [
    {
      name: "drops the isError branch entirely (read failure renders as honest empty)",
      apply: (s) => s.replace(/policiesQuery\.isError/g, "false"),
    },
    {
      name: "keeps the ListErrorState but stops suppressing rows (stale actionable rows survive an error)",
      apply: (s) => s.replace("const rows = policiesQuery.isError ? [] : (policiesQuery.data?.rows ?? []);", "const rows = policiesQuery.data?.rows ?? [];"),
    },
    {
      name: "ListErrorState's Retry is disconnected from policiesQuery.refetch()",
      apply: (s) => s.replace("onRetry={() => void policiesQuery.refetch()}", "onRetry={() => {}}"),
    },
  ];
  let allCaught = true;
  for (const m of mutations) {
    const mutated = m.apply(good);
    if (assertPage(mutated).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — NOT CAUGHT: ${m.name}`);
      allCaught = false;
    }
  }
  if (!allCaught) process.exit(1);
  console.log(`${LABEL} selftest PASS (${mutations.length} DRV-MONEY-F7449 regressions caught)`);
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
console.log(`${LABEL} PASS — auto deduction policies staged filters`);
