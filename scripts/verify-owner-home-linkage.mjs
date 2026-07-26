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
 *                      FKs; the panel must render record-specific Links to /drivers/:id and
 *                      /fleet/units/:id (not a generic module landing).
 *   home widgets       Every list/alert home panel keeps a drill-through affordance (a <Link to=…>
 *                      or navigate(action_url)) — a panel that renders records with no way to open
 *                      them is a linkage defect.
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
    patterns: [
      /to=\{`\/drivers\/\$\{encodeURIComponent\(row\.driver_id\)\}`\}/,
      /to=\{`\/fleet\/units\/\$\{encodeURIComponent\(row\.unit_id\)\}`\}/,
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

const DRILL_RE = /\bto=["{]|navigate\(/;

function scan() {
  const failures = [];
  for (const rule of RULES) {
    const src = read(rule.file);
    if (!src) {
      failures.push(`${rule.file}: MISSING (rule "${rule.label}")`);
      continue;
    }
    for (const pat of rule.patterns) {
      if (!pat.test(src)) failures.push(`${rule.file}: missing ${pat} — ${rule.label}`);
    }
    for (const bad of rule.forbidden ?? []) {
      if (bad.pattern.test(src)) failures.push(`${rule.file}: forbidden ${bad.pattern} — ${bad.why}`);
    }
  }
  for (const file of DRILL_THROUGH_PANELS) {
    const src = read(file);
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
  // relax back to the shape it used to demand).
  const checks = [
    [
      "driver link required",
      RULES[1].patterns[0].test('x to={`/drivers/${encodeURIComponent(row.driver_id)}`} y') &&
        !RULES[1].patterns[0].test("x <span>no link</span> y"),
    ],
    [
      "canonical load link required",
      RULES[1].patterns[2].test('<EntityLink kind="load" id={row.id} label="Open" />') &&
        !RULES[1].patterns[2].test('<Link to={`/dispatch?load_id=${encodeURIComponent(row.id)}`}>Open</Link>'),
    ],
    [
      "superseded ?load_id= forbidden",
      RULES[1].forbidden[0].pattern.test('<Link to={`/dispatch?load_id=${encodeURIComponent(row.id)}`}>Open</Link>') &&
        !RULES[1].forbidden[0].pattern.test('<EntityLink kind="load" id={row.id} label="Open" />'),
    ],
  ];
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
