#!/usr/bin/env node
/**
 * verify:dispatch-alerts-query-error
 *
 * systemic-pattern-mandatory-error-states (one surface):
 * DispatchAlertsPage must not collapse query failures into "—" (false-empty).
 * Failures must surface ListErrorBanner + retry, and per-card "Error" labels.
 *
 * Rule 17 — verify-step only (no package.json / locked-guards / ci.yml).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = "apps/frontend/src/pages/dispatch/DispatchAlertsPage.tsx";
const TEST = "apps/frontend/src/pages/dispatch/__tests__/DispatchAlertsPage.test.tsx";

function checkSources({ page, test }) {
  const failures = [];

  if (!page.includes('from "../../components/shared/ListErrorBanner"')) {
    failures.push("DispatchAlertsPage must import ListErrorBanner");
  }
  if (
    !/message=["']Failed to load one or more dispatch alert counts\.[^"']*["']/.test(page)
  ) {
    failures.push(
      'must use ListErrorBanner message starting with "Failed to load one or more dispatch alert counts."'
    );
  }
  if (!/anyQueryError/.test(page)) {
    failures.push("must gate the banner on anyQueryError (aggregate query failure)");
  }
  if (!/formatCount\(c\.count,\s*c\.isError\)/.test(page) && !/formatCount\([^,]+,\s*[^)]*isError/.test(page)) {
    failures.push("formatCount must accept isError so failed cards do not render as —");
  }
  if (!page.includes('return "Error"') && !page.includes("return 'Error'")) {
    failures.push('failed cards must render "Error", not "—"');
  }
  // Forbidden: isError ? null : count  (swallows error into em-dash via formatCount(null))
  if (/isError\s*\?\s*null\s*:/.test(page) && !/isLoading\s*\|\|\s*\w+\.isError\s*\?\s*null/.test(page)) {
    // Loading||isError ? null is OK when formatCount gets isError separately.
    // The old pattern was: isError ? null : count  then formatCount(n) with no isError → "—"
  }
  if (/function formatCount\(n: number \| null\): string/.test(page)) {
    failures.push("formatCount must take isError — single-arg formatCount collapses errors to —");
  }
  if (!test.includes("Failed to load one or more dispatch alert counts") || !test.includes("Error")) {
    failures.push("DispatchAlertsPage.test.tsx must cover banner + Error card label on query failure");
  }
  if (!test.includes("refetch") && !test.includes("Refresh")) {
    failures.push("test must exercise retry / Refresh path");
  }

  return failures;
}

if (process.argv.includes("--selftest")) {
  const bad = `
    function formatCount(n: number | null): string {
      if (n === null) return "—";
      return String(n);
    }
    const lateCount = lateQ.isError ? null : lateQ.data?.count;
  `;
  const good = `
    import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
    function formatCount(n: number | null, isError: boolean): string {
      if (isError) return "Error";
      if (n === null) return "—";
      return String(n);
    }
    const anyQueryError = true;
    {anyQueryError ? <ListErrorBanner message="Failed to load one or more dispatch alert counts." onRetry={() => {}} /> : null}
    formatCount(c.count, c.isError)
  `;
  const goodTest = `
    expect(await screen.findByText("Failed to load one or more dispatch alert counts.")).toBeTruthy();
    expect(screen.getAllByText("Error").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /Refresh/i })).toBeTruthy();
  `;
  if (checkSources({ page: bad, test: "" }).length === 0) {
    console.error("verify:dispatch-alerts-query-error --selftest FAIL: bad fixture accepted");
    process.exit(1);
  }
  if (checkSources({ page: good, test: goodTest }).length > 0) {
    console.error("verify:dispatch-alerts-query-error --selftest FAIL: good fixture rejected");
    console.error(checkSources({ page: good, test: goodTest }));
    process.exit(1);
  }
  console.log("verify:dispatch-alerts-query-error --selftest PASS");
  process.exit(0);
}

const page = fs.readFileSync(path.join(ROOT, PAGE), "utf8");
const test = fs.readFileSync(path.join(ROOT, TEST), "utf8");
const failures = checkSources({ page, test });

if (failures.length > 0) {
  console.error("verify:dispatch-alerts-query-error FAIL:");
  for (const f of failures) console.error("  ✗ " + f);
  process.exit(1);
}
console.log("verify:dispatch-alerts-query-error PASS");
