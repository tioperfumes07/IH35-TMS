#!/usr/bin/env node
/**
 * GUARD — FLEET-KPI-PARITY.
 *
 * THE DEFECT THIS ASSERTS AGAINST (live, USMCA, 2026-08-02): the Fleet roster showed "0 of 0" while
 * the maintenance dashboard AVG-AGE tile rendered 4.0y off the SAME table, same entity. Both queries
 * scoped correctly by (owner_company_id OR currently_leased_to_company_id) — they disagreed because
 * the demo/phantom exclusion was a PRIVATE function inside units-unified-list.service.ts, so only the
 * roster applied it. A unit named TEST-U01 was hidden from the list and counted by the KPI.
 *
 * A KPI a human reads as fact must be computed over exactly the rows its list will show, or it is
 * unauditable — you cannot click through to the rows that produced the number.
 *
 * FLEET-VISIBILITY-F4583-SAMPLE-DATA-GAP (2026-08-23, live-caught on prod): the SAM-%/TEST%/%DEMO%
 * name pattern predates migration 0403's is_sample_data column and was never widened for it, so a
 * fixture named "CODEX-AUDIT-UNIT-20260816-0349" (correctly flagged is_sample_data=true) was live on
 * the real /fleet roster AND counted in its KPI tiles — the exact same drift class this guard already
 * exists to prevent, one predicate deeper. A THIRD reader (fleet-table/rows, backing FleetTablePage)
 * had ZERO exclusion of any kind and is now enumerated below alongside the original two.
 *
 * WHAT IT ENFORCES:
 *   1. The shared helpers exist and are exported from mdata/fleet-visibility.ts.
 *   2. Every reader in READERS imports both — no file re-inlines the pattern locally.
 *   3. Every enumerated mdata.units query (roster, fleet-table/kpis, fleet-table/rows) applies both
 *      the demo-phantom name pattern AND the is_sample_data flag.
 *
 * Deliberately NOT enforced: that EVERY mdata.units reader filters. Many legitimately must not (the
 * fixed-asset register, QBO reconcilers, seed importers) — a blanket rule would be over-broad and get
 * allowlisted into uselessness. This guard enumerates the human-facing fleet surfaces only. Also NOT
 * enforced: mdata.equipment (trailers) — it has no is_sample_data column (migration 0403 added it to
 * 5 tables, not equipment); a distinct, separately-schema-owned gap.
 */
import { readFileSync, existsSync } from "node:fs";

const LABEL = "verify:fleet-visibility-parity";
const HELPER = "apps/backend/src/mdata/fleet-visibility.ts";
const DASHBOARD = "apps/backend/src/maintenance/dashboard.routes.ts";
const READERS = ["apps/backend/src/mdata/units-unified-list.service.ts", DASHBOARD];
// The literal pattern. If a file contains this WITHOUT importing the helper, it has its own copy.
const INLINE_PATTERN = /NOT\s+ILIKE\s+'SAM-%'/i;
const IMPORT_RE = /import\s*\{[^}]*\bexcludeDemoPhantomSql\b[^}]*\}\s*from\s*["'][^"']*fleet-visibility\.js["']/;
const SAMPLE_IMPORT_RE =
  /import\s*\{[^}]*\bexcludeSampleDataSql\b[^}]*\}\s*from\s*["'][^"']*fleet-visibility\.js["']/;
const SAMPLE_CALL_RE = /excludeSampleDataSql\(/;

function analyse(files) {
  const problems = [];

  const helper = files[HELPER];
  if (helper == null) {
    problems.push(`${HELPER} is missing — the shared fleet-visibility helper must exist.`);
  } else {
    if (!/export\s+function\s+excludeDemoPhantomSql/.test(helper)) {
      problems.push(`${HELPER} no longer EXPORTS excludeDemoPhantomSql.`);
    }
    if (!/export\s+function\s+excludeSampleDataSql/.test(helper)) {
      problems.push(`${HELPER} no longer EXPORTS excludeSampleDataSql.`);
    }
  }

  for (const reader of READERS) {
    const src = files[reader];
    if (src == null) {
      problems.push(`${reader} is missing — cannot verify fleet-visibility parity.`);
      continue;
    }
    if (!IMPORT_RE.test(src)) {
      problems.push(
        `${reader} does not import excludeDemoPhantomSql from ./fleet-visibility.js. ` +
          `The roster and the fleet KPI must share ONE definition or they drift (USMCA showed ` +
          `"0 of 0" beside an AVG-AGE of 4.0y over the same table).`
      );
    }
    if (INLINE_PATTERN.test(src) && !IMPORT_RE.test(src)) {
      problems.push(`${reader} inlines its own SAM-/TEST/DEMO pattern instead of importing the helper.`);
    }
    if (!SAMPLE_IMPORT_RE.test(src)) {
      problems.push(
        `${reader} does not import excludeSampleDataSql from ./fleet-visibility.js — is_sample_data ` +
          `fixture rows can surface on this human-facing fleet surface (FLEET-VISIBILITY-F4583).`
      );
    }
  }

  // Each enumerated mdata.units query must actually APPLY both predicates — importing and not using
  // is the same defect. units-unified-list's truck query is the FIRST "FROM mdata.units" block.
  const unified = files[READERS[0]];
  if (unified != null) {
    // truckFilters (which includes the excludeSampleDataSql() call) is built in JS BEFORE the SQL
    // template literal that references it via ${truckFilters.join(...)} — so the window must start
    // at file top, not at the literal "FROM mdata.units" text, to see the call.
    const truckQuery = unified.slice(0, unified.indexOf("FROM mdata.equipment"));
    if (!SAMPLE_CALL_RE.test(truckQuery)) {
      problems.push(
        `${READERS[0]}: the roster's truck query does not apply excludeSampleDataSql() — ` +
          `is_sample_data units would be visible on the live Fleet roster.`
      );
    }
  }

  const dash = files[DASHBOARD];
  if (dash != null) {
    const kpiStart = dash.indexOf("FROM mdata.units");
    const kpiQuery = dash.slice(kpiStart, dash.indexOf("`", kpiStart));
    if (!/excludeDemoPhantomSql\(\s*["']unit_number["']\s*\)/.test(kpiQuery)) {
      problems.push(
        `${DASHBOARD} queries mdata.units for the fleet KPI without applying ` +
          `excludeDemoPhantomSql("unit_number") — the KPI would count rows the Fleet roster hides.`
      );
    }
    if (!SAMPLE_CALL_RE.test(kpiQuery)) {
      problems.push(
        `${DASHBOARD} fleet-table/kpis query does not apply excludeSampleDataSql() — is_sample_data ` +
          `units would inflate the live Fleet KPI tiles (FLEET-VISIBILITY-F4583).`
      );
    }

    // A second, independent mdata.units reader in the same file: fleet-table/rows (FleetTablePage).
    // It historically had ZERO exclusion of any kind — search past the KPI block's own occurrence.
    const rowsStart = dash.indexOf("FROM mdata.units u", kpiStart + kpiQuery.length);
    if (rowsStart === -1) {
      problems.push(
        `${DASHBOARD}: expected a second "FROM mdata.units u" query (fleet-table/rows, backs ` +
          `FleetTablePage) was not found — re-anchor this guard if the route was restructured.`
      );
    } else {
      const rowsQuery = dash.slice(rowsStart, dash.indexOf("`", rowsStart));
      if (!/excludeDemoPhantomSql\(\s*["']u\.unit_number["']\s*\)/.test(rowsQuery)) {
        problems.push(
          `${DASHBOARD} fleet-table/rows query does not apply excludeDemoPhantomSql("u.unit_number") ` +
            `— demo/phantom fixture units would be visible on the Fleet Table page.`
        );
      }
      if (!SAMPLE_CALL_RE.test(rowsQuery)) {
        problems.push(
          `${DASHBOARD} fleet-table/rows query does not apply excludeSampleDataSql() — is_sample_data ` +
            `units would be visible on the Fleet Table page (FLEET-VISIBILITY-F4583).`
        );
      }
    }
  }

  return problems;
}

function readAll() {
  const out = {};
  for (const f of [HELPER, ...READERS]) out[f] = existsSync(f) ? readFileSync(f, "utf8") : null;
  return out;
}

function selftest() {
  const failures = [];
  const t = (label, cond) => {
    if (!cond) failures.push(label);
  };

  const goodHelper =
    "export function excludeDemoPhantomSql(col) { return `${col} NOT ILIKE 'SAM-%'`; }\n" +
    "export function excludeSampleDataSql(col = 'is_sample_data') { return `${col} IS NOT TRUE`; }";
  const goodReader =
    'import { excludeDemoPhantomSql, excludeSampleDataSql } from "./fleet-visibility.js";\n' +
    "FROM mdata.units\nexcludeDemoPhantomSql(\"unit_number\")\nexcludeSampleDataSql()\n`\nFROM mdata.equipment\n`";
  const goodDashboard =
    'import { excludeDemoPhantomSql, excludeSampleDataSql } from "./fleet-visibility.js";\n' +
    'FROM mdata.units\nexcludeDemoPhantomSql("unit_number")\nexcludeSampleDataSql()\n`\n' +
    'FROM mdata.units u\nexcludeDemoPhantomSql("u.unit_number")\nexcludeSampleDataSql("u.is_sample_data")\n`';

  // PASSES on the fixed shape.
  t(
    "clean tree passes",
    analyse({
      [HELPER]: goodHelper,
      [READERS[0]]: goodReader,
      [DASHBOARD]: goodDashboard,
    }).length === 0
  );

  // FAILS on the REAL pre-fix shape: dashboard queries mdata.units with no exclusion, no import.
  t(
    "pre-fix dashboard (no import, no predicate) FAILS",
    analyse({
      [HELPER]: goodHelper,
      [READERS[0]]: goodReader,
      [DASHBOARD]: "FROM mdata.units\nWHERE owner_company_id = $1 AND deactivated_at IS NULL",
    }).length >= 2
  );

  // FAILS when a reader re-inlines its own copy (the drift that caused this).
  t(
    "inlined private copy FAILS",
    analyse({
      [HELPER]: goodHelper,
      [READERS[0]]: "function excludeDemoPhantomSql(c){return `${c} NOT ILIKE 'SAM-%'`}\nFROM mdata.units",
      [DASHBOARD]: goodDashboard,
    }).length >= 1
  );

  // FAILS when the helper stops exporting.
  t(
    "helper un-exported FAILS",
    analyse({
      [HELPER]: "function excludeDemoPhantomSql(col) {}\nfunction excludeSampleDataSql(col) {}",
      [READERS[0]]: goodReader,
      [DASHBOARD]: goodDashboard,
    }).length >= 1
  );

  // FAILS when imported but not applied in the KPI query.
  t(
    "imported-but-unused in KPI FAILS",
    analyse({
      [HELPER]: goodHelper,
      [READERS[0]]: goodReader,
      [DASHBOARD]:
        'import { excludeDemoPhantomSql, excludeSampleDataSql } from "./fleet-visibility.js";\n' +
        'FROM mdata.units\nWHERE 1=1\n`\nFROM mdata.units u\nWHERE 1=1\n`',
    }).length >= 1
  );

  // FAILS the new sample-data class: KPI applies the name pattern but not the flag.
  t(
    "KPI missing excludeSampleDataSql FAILS (FLEET-VISIBILITY-F4583)",
    analyse({
      [HELPER]: goodHelper,
      [READERS[0]]: goodReader,
      [DASHBOARD]:
        'import { excludeDemoPhantomSql, excludeSampleDataSql } from "./fleet-visibility.js";\n' +
        'FROM mdata.units\nexcludeDemoPhantomSql("unit_number")\n`\n' +
        'FROM mdata.units u\nexcludeDemoPhantomSql("u.unit_number")\nexcludeSampleDataSql("u.is_sample_data")\n`',
    }).length >= 1
  );

  // FAILS the new third-reader class: fleet-table/rows has neither predicate (the real pre-fix shape).
  t(
    "fleet-table/rows with zero exclusion FAILS (FLEET-VISIBILITY-F4583)",
    analyse({
      [HELPER]: goodHelper,
      [READERS[0]]: goodReader,
      [DASHBOARD]:
        'import { excludeDemoPhantomSql, excludeSampleDataSql } from "./fleet-visibility.js";\n' +
        'FROM mdata.units\nexcludeDemoPhantomSql("unit_number")\nexcludeSampleDataSql()\n`\n' +
        "FROM mdata.units u\nWHERE u.deactivated_at IS NULL\n`",
    }).length >= 2
  );

  // The exit lives INSIDE this function on purpose. verify-selftests-can-fail.mjs statically reads the
  // selftest body and treats "collects failures but cannot exit non-zero" as the fake-green pattern —
  // correctly, because a selftest whose failure path is unreachable proves nothing. Exiting here makes
  // the failure path real and locally visible.
  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:\n  - ${failures.join("\n  - ")}`);
    process.exit(1);
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  selftest();
  console.log(`${LABEL} selftest OK — 7 cases (1 pass-shape, 6 fail-shapes)`);
  process.exit(0);
}

const problems = analyse(readAll());
if (problems.length) {
  console.error(`${LABEL} FAILED:\n  - ${problems.join("\n  - ")}`);
  process.exit(1);
}
console.log(`${LABEL} OK — roster, fleet KPI, and fleet-table rows share one visibility definition`);
