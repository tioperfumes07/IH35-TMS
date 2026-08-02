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
 * WHAT IT ENFORCES:
 *   1. The shared helper exists and is exported from mdata/fleet-visibility.ts.
 *   2. Every reader in READERS imports it — no file re-inlines the pattern locally.
 *   3. The maintenance fleet-KPI query over mdata.units actually applies it.
 *
 * Deliberately NOT enforced: that EVERY mdata.units reader filters. Many legitimately must not (the
 * fixed-asset register, QBO reconcilers, seed importers) — a blanket rule would be over-broad and get
 * allowlisted into uselessness. This guard enumerates the human-facing fleet surfaces only.
 */
import { readFileSync, existsSync } from "node:fs";

const LABEL = "verify:fleet-visibility-parity";
const HELPER = "apps/backend/src/mdata/fleet-visibility.ts";
const READERS = [
  "apps/backend/src/mdata/units-unified-list.service.ts",
  "apps/backend/src/maintenance/dashboard.routes.ts",
];
// The literal pattern. If a file contains this WITHOUT importing the helper, it has its own copy.
const INLINE_PATTERN = /NOT\s+ILIKE\s+'SAM-%'/i;
const IMPORT_RE = /import\s*\{[^}]*\bexcludeDemoPhantomSql\b[^}]*\}\s*from\s*["'][^"']*fleet-visibility\.js["']/;

function analyse(files) {
  const problems = [];

  const helper = files[HELPER];
  if (helper == null) {
    problems.push(`${HELPER} is missing — the shared fleet-visibility helper must exist.`);
  } else if (!/export\s+function\s+excludeDemoPhantomSql/.test(helper)) {
    problems.push(`${HELPER} no longer EXPORTS excludeDemoPhantomSql.`);
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
  }

  // The KPI query itself must apply the predicate — importing it and not using it is the same defect.
  const dash = files["apps/backend/src/maintenance/dashboard.routes.ts"];
  if (dash != null) {
    const kpi = dash.slice(dash.indexOf("FROM mdata.units"));
    if (!/excludeDemoPhantomSql\(\s*["']unit_number["']\s*\)/.test(kpi)) {
      problems.push(
        `maintenance/dashboard.routes.ts queries mdata.units for the fleet KPI without applying ` +
          `excludeDemoPhantomSql("unit_number") — the KPI would count rows the Fleet roster hides.`
      );
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

  const goodHelper = "export function excludeDemoPhantomSql(col) { return `${col} NOT ILIKE 'SAM-%'`; }";
  const goodReader =
    'import { excludeDemoPhantomSql } from "./fleet-visibility.js";\nFROM mdata.units\nexcludeDemoPhantomSql("unit_number")';

  // PASSES on the fixed shape.
  t(
    "clean tree passes",
    analyse({
      [HELPER]: goodHelper,
      [READERS[0]]: goodReader,
      [READERS[1]]: goodReader,
    }).length === 0
  );

  // FAILS on the REAL pre-fix shape: dashboard queries mdata.units with no exclusion, no import.
  t(
    "pre-fix dashboard (no import, no predicate) FAILS",
    analyse({
      [HELPER]: goodHelper,
      [READERS[0]]: goodReader,
      [READERS[1]]: "FROM mdata.units\nWHERE owner_company_id = $1 AND deactivated_at IS NULL",
    }).length >= 2
  );

  // FAILS when a reader re-inlines its own copy (the drift that caused this).
  t(
    "inlined private copy FAILS",
    analyse({
      [HELPER]: goodHelper,
      [READERS[0]]: "function excludeDemoPhantomSql(c){return `${c} NOT ILIKE 'SAM-%'`}\nFROM mdata.units",
      [READERS[1]]: goodReader,
    }).length >= 1
  );

  // FAILS when the helper stops exporting.
  t(
    "helper un-exported FAILS",
    analyse({
      [HELPER]: "function excludeDemoPhantomSql(col) {}",
      [READERS[0]]: goodReader,
      [READERS[1]]: goodReader,
    }).length >= 1
  );

  // FAILS when imported but not applied in the KPI query.
  t(
    "imported-but-unused in KPI FAILS",
    analyse({
      [HELPER]: goodHelper,
      [READERS[0]]: goodReader,
      [READERS[1]]: 'import { excludeDemoPhantomSql } from "./fleet-visibility.js";\nFROM mdata.units\nWHERE 1=1',
    }).length >= 1
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
  console.log(`${LABEL} selftest OK — 5 cases (1 pass-shape, 4 fail-shapes)`);
  process.exit(0);
}

const problems = analyse(readAll());
if (problems.length) {
  console.error(`${LABEL} FAILED:\n  - ${problems.join("\n  - ")}`);
  process.exit(1);
}
console.log(`${LABEL} OK — roster and fleet KPI share one visibility definition`);
