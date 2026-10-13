#!/usr/bin/env node
/**
 * RPT-F3524 / LV-REPORTS-GEOFENCE-RECON-GROUPED-TABLES-MISSING-SURFACE-BAR
 * Geofence reconciliation must always mount one ParityTable (Search+Range+gear),
 * including the honest 0-row empty state — never a green-only bypass that skips the table.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { withMutatedCopy } from "./_lib/selftest-safe-mutation.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = "apps/frontend/src/pages/reports/GeofenceReconciliationReport.tsx";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

export function check(filePath = path.join(ROOT, PAGE)) {
  const src = fs.readFileSync(filePath, "utf8");
  assert(src.includes("ParityTable"), "GeofenceReconciliationReport: must use ParityTable");
  assert(src.includes('storageKey="geofence-recon"'), "GeofenceReconciliationReport: must use one always-mounted storageKey=geofence-recon");
  assert(!/Object\.entries\(\s*byClass\s*\)/.test(src), "GeofenceReconciliationReport: must not group into multiple ParityTables (missing surface bar on empty)");
  assert(!/bg-green-50[\s\S]*No anomalies found/.test(src), "GeofenceReconciliationReport: must not green-only bypass that skips ParityTable");
  // LEAD 443.99 class B (2026-10-12) — empty text, export name and Apply-staged date.
  //   old rule: emptyText interpolates appliedDate or formatDateUS(appliedDate); exportFilename uses
  //             `${appliedDate}`; Apply commits through setAppliedDate(date | next.reportDate).
  //   new rule: emptyText interpolates mmmDd(appliedDate) (raw appliedDate / formatDateUS still accepted);
  //             exportFilename is `geofence-recon-${appliedDate}` or `${appliedFilters.appliedDate}`; Apply
  //             commits through useStagedListFilters({ ..., onApply: setAppliedFilters }) with the bar's
  //             onApply={staged.apply} and fromDate={staged.draft.appliedDate} — or the old setAppliedDate.
  //   why: RPT-04 (#21363, ff3721a970) moved every report onto useStagedListFilters (draft -> Apply) and
  //        GLB-08 (#25795, b466548ae0) moved report dates to mmmDd. Same contract: one empty-state sentence
  //        naming the applied date, and the date applies only on Apply. A live (un-staged) date still fails.
  assert(
    /emptyText=\{`No anomalies found for \$\{(appliedDate|formatDateUS\(appliedDate\)|mmmDd\(appliedDate\))\}\.`\}/.test(src),
    "GeofenceReconciliationReport: honest emptyText on ParityTable",
  );
  assert(
    /exportFilename=\{`geofence-recon-\$\{(appliedDate|appliedFilters\.appliedDate)\}`\}/.test(src),
    "GeofenceReconciliationReport: exportFilename for surface Export",
  );
  const legacyApply = /setAppliedDate\((date|next\.reportDate)\)/.test(src);
  const stagedApply =
    /useStagedListFilters\(\{[\s\S]{0,160}onApply:\s*setAppliedFilters/.test(src) &&
    /onApply=\{staged\.apply\}/.test(src) &&
    /fromDate=\{staged\.draft\.appliedDate\}/.test(src);
  assert(src.includes("appliedDate") && (legacyApply || stagedApply), "GeofenceReconciliationReport: keep Apply-staged date");
}

// GUARD-SELFTEST-MUTATES-SOURCE fix: never write the plant into the real tracked file. Copy it
// to a temp path (withMutatedCopy), plant there, assert against the copy — apps/ is never touched.
async function selftest() {
  check();
  const realPath = path.join(ROOT, PAGE);
  let failed = false;
  await withMutatedCopy(
    realPath,
    (good) => {
  // Plant old defect: green-only empty + grouped tables, no always-mounted table.
  const bad = good
    .replace(/storageKey="geofence-recon"/, 'storageKey={`geofence-recon-${cls}`}')
    .replace(
      /\{!isError && \(\s*<ParityTable[\s\S]*?\/>\s*\)\}/,
      `{!isLoading && !isError && findings.length === 0 && (
        <div className="bg-green-50 border border-green-200 rounded-sm p-4 text-green-700">
          No anomalies found for {appliedDate}.
        </div>
      )}
      {Object.entries(byClass).map(([cls, items]) => (
        <ParityTable key={cls} rows={items} columns={findingColumns} rowKey={(f) => f.uuid} storageKey={\`geofence-recon-\${cls}\`} />
      ))}`,
    );
  assert(bad.includes("bg-green-50"), "selftest fixture must include green bypass");
  assert(bad.includes("Object.entries(byClass)"), "selftest fixture must include grouped tables");
      return bad;
    },
    (tmpPath) => {
      try {
        check(tmpPath);
      } catch {
        failed = true;
      }
    },
  );
  assert(failed, "selftest: expected FAIL on green-only/grouped bypass");
  let liveDateFailed = false;
  await withMutatedCopy(
    realPath,
    (good) => {
      const bad = good.replace("fromDate={staged.draft.appliedDate}", "fromDate={appliedDate}");
      assert(bad !== good, "selftest fixture must un-stage the date");
      return bad;
    },
    (tmpPath) => {
      try {
        check(tmpPath);
      } catch {
        liveDateFailed = true;
      }
    },
  );
  assert(liveDateFailed, "selftest: expected FAIL when the date bypasses Apply");
  console.log("verify-geofence-recon-surface-bar --selftest PASS");
}

const args = process.argv.slice(2);
if (args.includes("--selftest")) selftest();
else {
  check();
  console.log("verify-geofence-recon-surface-bar PASS");
}
