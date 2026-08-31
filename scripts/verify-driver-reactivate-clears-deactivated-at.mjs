#!/usr/bin/env node
/**
 * DRV-F-STATUS-REACTIVATE-500 — static-shape guard.
 *
 * mdata.drivers has a CHECK constraint (chk_drivers_status_deactivated_consistent,
 * db/migrations/202606161300_drivers_deactivation_status_consistency.sql):
 *   deactivated_at IS NULL OR status IN ('Inactive', 'Terminated')
 *
 * The Driver Profile edit form's Status combobox PATCHes only { status } when a caller
 * reactivates a driver (e.g. sets status: "Active" on a previously-deactivated row) — it never
 * sends deactivated_at. Without clearing deactivated_at in the same statement, that PATCH violates
 * the CHECK constraint and 500s on every reactivation attempt. Live-reproduced 2026-08-31 (Fernando
 * Mecor Hernandez, USMCA driver id 93be328f-ba1b-4175-adaf-bb619c1c51f2): PATCH
 * /api/v1/mdata/drivers/:id { status: "Active" } -> Postgres 23514 "new row for relation drivers
 * violates check constraint chk_drivers_status_deactivated_consistent".
 *
 * This guard asserts the PATCH handler in drivers.routes.ts auto-clears deactivated_at when the
 * caller sets a non-deactivated status and did not explicitly pass deactivated_at.
 *
 * Selftest: NEVER mutates the real file on disk (per GUARD-SELFTEST-MUTATES-SOURCE-2026-08-31.md —
 * a selftest that writeFileSync's into a tracked apps/ file corrupts the repo if the process is
 * killed mid-run, finally-block or not). This selftest mutates the source STRING in memory only.
 */
import { readFileSync } from "node:fs";

const FILE = "apps/backend/src/mdata/drivers.routes.ts";

function analyze(src) {
  const failures = [];

  const anchor = 'if ("status" in b) add("status", b.status);';
  const anchorIdx = src.indexOf(anchor);
  if (anchorIdx < 0) {
    failures.push(`${FILE}: status PATCH anchor not found — re-anchor this guard`);
    return failures;
  }

  // The auto-clear must appear shortly after the status assignment (same handler, before the
  // UPDATE statement is built), and must guard on status being active-ish AND deactivated_at not
  // already explicit in the body — never an unconditional clear (that would silently un-deactivate
  // a driver on any PATCH that merely touches status alongside an explicit deactivated_at).
  const window = src.slice(anchorIdx, anchorIdx + 1400);

  if (!/!\(\s*"deactivated_at"\s+in\s+b\s*\)/.test(window)) {
    failures.push(
      `${FILE}: no guard found requiring deactivated_at to be ABSENT from the request body before ` +
        "auto-clearing it — without this, an explicit deactivated_at in the same PATCH could be silently overridden"
    );
  }
  if (!/\[\s*"Inactive"\s*,\s*"Terminated"\s*\]/.test(window)) {
    failures.push(
      `${FILE}: no check against the deactivated statuses ('Inactive'/'Terminated') near the status ` +
        "assignment — reactivation auto-clear must not fire when the caller is deactivating/terminating"
    );
  }
  if (!/add\(\s*"deactivated_at"\s*,\s*null\s*\)/.test(window)) {
    failures.push(`${FILE}: no add("deactivated_at", null) found near the status assignment`);
  }

  return failures;
}

function selftest() {
  const src = readFileSync(FILE, "utf8");
  const good = analyze(src);
  if (good.length > 0) {
    console.error("verify-driver-reactivate-clears-deactivated-at --selftest: FAIL on the real (good) file");
    for (const f of good) console.error(`  - ${f}`);
    process.exit(1);
  }

  // Plant each of the 3 regressions independently, in memory only — never touch disk.
  const anchor = 'if ("status" in b) add("status", b.status);';
  const anchorIdx = src.indexOf(anchor);
  const before = src.slice(0, anchorIdx + anchor.length);
  const after = src.slice(anchorIdx + anchor.length, anchorIdx + anchor.length + 1400);
  const rest = src.slice(anchorIdx + anchor.length + 1400);

  const regressions = [
    { name: "drop the whole auto-clear block", mutated: before + rest },
    {
      name: "drop the deactivated_at-absent guard (unconditional clear)",
      mutated: before + after.replace('!("deactivated_at" in b) && ', "") + rest,
    },
    {
      name: "drop the Inactive/Terminated exclusion (clears even when deactivating)",
      mutated: before + after.replace('!["Inactive", "Terminated"].includes(b.status as string)', "true") + rest,
    },
  ];

  for (const { name, mutated } of regressions) {
    if (mutated === src) {
      console.error(`verify-driver-reactivate-clears-deactivated-at --selftest: mutation "${name}" did not change the source -- pattern out of sync`);
      process.exit(1);
    }
    const failures = analyze(mutated);
    if (failures.length === 0) {
      console.error(`verify-driver-reactivate-clears-deactivated-at --selftest: NOT CAUGHT -- ${name}`);
      process.exit(1);
    }
    console.log(`  caught: ${name}`);
  }
  console.log("SELFTEST PASS: 3/3 planted regressions caught (in-memory only, no disk mutation).");
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    process.exit(0);
  }
  const src = readFileSync(FILE, "utf8");
  const failures = analyze(src);
  if (failures.length > 0) {
    console.error("\n[verify-driver-reactivate-clears-deactivated-at] FAILED:\n");
    for (const f of failures) console.error(`  ✗ ${f}`);
    process.exit(1);
  }
  console.log("[verify-driver-reactivate-clears-deactivated-at] All checks passed ✓");
  process.exit(0);
}

main();
