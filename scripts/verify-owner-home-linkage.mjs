#!/usr/bin/env node
/**
 * verify-owner-home-linkage.mjs  (0280-* cluster — owner/role home LINKAGE-VERIFICATION regression guard)
 *
 * The owner + role home dashboards are the top of the drill-through tree: every KPI, list row, and
 * alert must connect back to its canonical record (LINKAGE LAW §10c/§10d — forward links, never a
 * dead-end number). This guard freezes the linkages built/verified in the 0280-* cluster so they
 * cannot silently regress:
 *
 *   0280-03 / 0280-09  Active-loads widget surfaces the assigned DRIVER + power UNIT and drills
 *                      through to each (load↔driver↔unit). Backend must SELECT driver/unit ids +
 *                      labels and JOIN the canonical mdata.drivers / mdata.units on the assignment
 *                      FKs; the panel must render record-specific drill-through to /drivers/:id and
 *                      /fleet/units/:id (raw <Link to=…> OR shared <EntityLink kind=…>) — never a
 *                      generic module landing.
 *   home widgets       Every list/alert home panel keeps a drill-through affordance (a <Link to=…>
 *                      or navigate(action_url) or EntityLink) — a panel that renders records with no
 *                      way to open them is a linkage defect.
 *
 * Usage:
 *   node scripts/verify-owner-home-linkage.mjs            # scan
 *   node scripts/verify-owner-home-linkage.mjs --selftest # inject a regression -> must FAIL
 *
 * LINKAGE: home dashboards → mdata.loads / mdata.drivers / mdata.units (forward drill-through). Additive only.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();

function read(rel) {
  try {
    return fs.readFileSync(path.join(repoRoot, rel), "utf8");
  } catch {
    return "";
  }
}

/** Assertions that must ALL hold. Each: { file, label, patterns:[RegExp] all-required }. */
const RULES = [
  {
    file: "apps/backend/src/dispatcher-board/role-views/dispatcher.service.ts",
    label: "0280-03/09 backend: active-loads SELECTs driver+unit and JOINs canonical mdata tables",
    patterns: [
      /AS driver_id/,
      /AS driver_name/,
      /AS unit_id/,
      /AS unit_number/,
      /LEFT JOIN mdata\.drivers\b[^\n]*assigned_primary_driver_id/,
      /LEFT JOIN mdata\.units\b[^\n]*assigned_unit_id/,
    ],
  },
  {
    file: "apps/frontend/src/components/home/DispatcherActiveLoadsPanel.tsx",
    label: "0280-03/09 panel: driver + unit + load render as record-specific drill-through links",
    // Driver/unit: accept raw Link OR EntityLink (parallel kind-sweep PRs). Load: EntityLink only (C5).
    anyOfPatterns: [
      {
        label: "driver drill-through (Link or EntityLink kind=driver)",
        patterns: [
          /to=\{`\/drivers\/\$\{encodeURIComponent\(row\.driver_id\)\}`\}/,
          /<EntityLink[^>]*kind=["']driver["'][^>]*id=\{row\.driver_id\}/,
        ],
      },
      {
        label: "unit drill-through (Link or EntityLink kind=unit)",
        patterns: [
          /to=\{`\/fleet\/units\/\$\{encodeURIComponent\(row\.unit_id\)\}`\}/,
          /<EntityLink[^>]*kind=["']unit["'][^>]*id=\{row\.unit_id\}/,
        ],
      },
    ],
    patterns: [
      // C5 (2026-07-25) TIGHTENED, NOT WEAKENED. This pattern required the literal
      // `to={`/dispatch?load_id=${encodeURIComponent(row.id)}`}`, so the guard PINNED the
      // query-param form and would have failed the canonical migration. The 0280-03/09 intent —
      // "the load is a record-specific drill-through, not a bare label" — is unchanged; the
      // accepted shape is now the shared primitive, which resolves to /dispatch/loads/:id.
      /<EntityLink[^>]*kind=["']load["'][^>]*id=\{row\.id\}/,
    ],
    // C5 — and the superseded form must not come back.
    forbidden: [
      {
        pattern: /to=\{`\/dispatch\?[^`]*\bload_id=/,
        why: "load must use EntityLink kind=\"load\" (/dispatch/loads/:id), not a ?load_id= board bookmark",
      },
      {
        pattern: /to=\{`[^`]*\?[^`]*\bdriver_id=/,
        why: "driver must drill to /drivers/:id (Link or EntityLink), not a ?driver_id= bookmark",
      },
    ],
  },
];

/** Home panels that must retain SOME drill-through affordance (Link to= OR navigate(). */
const DRILL_THROUGH_PANELS = [
  "apps/frontend/src/components/home/DispatcherActiveLoadsPanel.tsx",
  "apps/frontend/src/components/home/DispatcherPendingActionsPanel.tsx",
  "apps/frontend/src/components/home/AccountingPendingApprovalsPanel.tsx",
  "apps/frontend/src/components/home/SafetyAlertsPanel.tsx",
  "apps/frontend/src/components/home/DriverManagerAttentionPanel.tsx",
  "apps/frontend/src/components/home/TodaysAttentionTop5.tsx",
];

const DRILL_RE = /\bto=["{]|navigate\(|<EntityLink\b/;

function scan(readSource = read) {
  const failures = [];
  for (const rule of RULES) {
    const src = readSource(rule.file);
    if (!src) {
      failures.push(`${rule.file}: MISSING (rule "${rule.label}")`);
      continue;
    }
    for (const pat of rule.patterns ?? []) {
      if (!pat.test(src)) failures.push(`${rule.file}: missing ${pat} — ${rule.label}`);
    }
    for (const group of rule.anyOfPatterns ?? []) {
      if (!group.patterns.some((pat) => pat.test(src))) {
        failures.push(`${rule.file}: missing ${group.label} — ${rule.label}`);
      }
    }
    for (const bad of rule.forbidden ?? []) {
      if (bad.pattern.test(src)) failures.push(`${rule.file}: forbidden ${bad.pattern} — ${bad.why}`);
    }
  }
  for (const file of DRILL_THROUGH_PANELS) {
    const src = readSource(file);
    if (!src) {
      failures.push(`${file}: MISSING (home drill-through panel)`);
      continue;
    }
    if (!DRILL_RE.test(src)) failures.push(`${file}: no drill-through affordance (Link to= / navigate())`);
  }
  return failures;
}

function selftest() {
  // Pure-logic self-test: a source missing a required link must be detected, and the superseded
  // ?load_id= form must be detected as forbidden (C5 — otherwise the ratchet could silently
  // relax back to the shape it used to demand). Driver/unit accept Link OR EntityLink.
  const driverGroup = RULES[1].anyOfPatterns[0];
  const unitGroup = RULES[1].anyOfPatterns[1];
  const loadPat = RULES[1].patterns[0];
  const checks = [
    [
      "driver Link accepted",
      driverGroup.patterns.some((p) =>
        p.test('x to={`/drivers/${encodeURIComponent(row.driver_id)}`} y'),
      ),
    ],
    [
      "driver EntityLink accepted",
      driverGroup.patterns.some((p) =>
        p.test('<EntityLink kind="driver" id={row.driver_id} label="Driver" />'),
      ),
    ],
    [
      "driver missing rejected",
      !driverGroup.patterns.some((p) => p.test("x <span>no link</span> y")),
    ],
    [
      "unit Link accepted",
      unitGroup.patterns.some((p) =>
        p.test('x to={`/fleet/units/${encodeURIComponent(row.unit_id)}`} y'),
      ),
    ],
    [
      "unit EntityLink accepted",
      unitGroup.patterns.some((p) =>
        p.test('<EntityLink kind="unit" id={row.unit_id} label="Unit" />'),
      ),
    ],
    [
      "canonical load link required",
      loadPat.test('<EntityLink kind="load" id={row.id} label="Open" />') &&
        !loadPat.test('<Link to={`/dispatch?load_id=${encodeURIComponent(row.id)}`}>Open</Link>'),
    ],
    [
      "superseded ?load_id= forbidden",
      RULES[1].forbidden[0].pattern.test(
        '<Link to={`/dispatch?load_id=${encodeURIComponent(row.id)}`}>Open</Link>',
      ) &&
        !RULES[1].forbidden[0].pattern.test(
          '<EntityLink kind="load" id={row.id} label="Open" />',
        ),
    ],
    [
      "superseded ?driver_id= forbidden",
      RULES[1].forbidden[1].pattern.test(
        '<Link to={`/dispatch?driver_id=${encodeURIComponent(row.driver_id)}`}>Driver</Link>',
      ) &&
        !RULES[1].forbidden[1].pattern.test(
          '<EntityLink kind="driver" id={row.driver_id} label="Driver" />',
        ),
    ],
  ];

  const panel = RULES[1].file;
  const plantedFailures = scan((rel) => {
    const source = read(rel);
    if (rel !== panel) return source;
    return source.replaceAll(
      /<EntityLink[^>]*kind=["']load["'][^>]*id=\{row\.id\}[^>]*\/>/g,
      "<span>{row.load_number}</span>",
    );
  });
  checks.push([
    "real scan rejects a planted missing canonical load drill",
    plantedFailures.some((failure) => failure.includes(panel) && failure.includes("kind")),
  ]);
  const failed = checks.filter(([, ok]) => !ok);
  if (failed.length) {
    console.error("verify:owner-home-linkage SELFTEST FAILED");
    for (const [name] of failed) console.error(`  ✗ ${name}`);
    process.exit(1);
  }
  console.log(`verify:owner-home-linkage SELFTEST PASS (${checks.length} checks)`);
  process.exit(0);
}

if (process.argv.includes("--selftest")) selftest();

const failures = scan();
if (failures.length) {
  console.error(`verify:owner-home-linkage — ${failures.length} linkage regression(s):`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("verify:owner-home-linkage — OK (owner/role home drill-through linkages intact)");
process.exit(0);
