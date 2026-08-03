#!/usr/bin/env node
/**
 * GUARD — SAF-INTEGRITY-CAT: every configured integrity RULE category must be admitted by the ALERT
 * table's CHECK constraint.
 *
 * THE DEFECT (live, failing again 2026-08-02 18:20 CT): safety.integrity_alert_engine_cron died with
 *   new row for relation "integrity_alerts" violates check constraint
 *   "integrity_alerts_alert_category_check"
 * The engine writes rule.alert_category straight from safety.integrity_alert_rules, and EIGHT rule
 * rows carried 'accounting_integrity', which the CHECK did not admit — orphan_bill_no_gl,
 * orphan_payment_unapplied, stale_posting_batch, unbalanced_journal_entry (x2 each). Every time one of
 * those matched, the INSERT was rejected and the whole tick died.
 *
 * Those four ARE the accounting watchdog: unbalanced journal entries, bills with no GL, unapplied
 * payments, stale posting batches. The one alert class that would catch a broken ledger could never
 * record itself, and safety.integrity_alerts held 0 rows.
 *
 * WHAT IT ENFORCES (static, no DB): the migrated CHECK is a TRUE SUPERSET of the previous 12 members
 * and includes 'accounting_integrity'. Re-stating a CHECK is exactly how members get silently dropped
 * — the 202610060000 CoA-role migration nearly did that — so the full prior set is asserted member by
 * member rather than trusted to a diff.
 *
 * A DATA-SIDE check (rule categories ⊆ allowed) cannot be done here without a DB; it belongs to GUARD's
 * live pass and is recorded as such rather than faked with a green static assertion.
 */
import { readFileSync, existsSync } from "node:fs";

const LABEL = "verify:integrity-alert-category-superset";
const MIGRATION = "db/migrations/202611180000_integrity_alerts_accounting_integrity_category.sql";

/** The 12 members that existed BEFORE the widen, read from pg_constraint on prod 2026-08-02. */
export const PRIOR_MEMBERS = [
  "tire_frequency_anomaly_unit",
  "repair_frequency_anomaly_unit",
  "unit_cost_anomaly",
  "accident_frequency_driver",
  "accident_frequency_unit",
  "driver_incident_frequency",
  "driver_repair_frequency",
  "driver_mpg_anomaly",
  "driver_tire_change_frequency",
  "vendor_cost_anomaly",
  "vendor_invoice_frequency",
  "vendor_driver_collusion_pattern",
];
export const REQUIRED_NEW = "accounting_integrity";

export function analyse(files) {
  const problems = [];
  const src = files[MIGRATION];
  if (src == null) {
    return [`${MIGRATION} is missing — the accounting watchdog cannot raise an alert without it.`];
  }
  // Only the ADD CONSTRAINT body matters; the guard's own prose must not satisfy it.
  const addIdx = src.lastIndexOf("ADD CONSTRAINT integrity_alerts_alert_category_check");
  if (addIdx === -1) {
    problems.push(`${MIGRATION}: no ADD CONSTRAINT integrity_alerts_alert_category_check.`);
    return problems;
  }
  const body = src.slice(addIdx);

  for (const m of PRIOR_MEMBERS) {
    if (!new RegExp(`'${m}'`).test(body)) {
      problems.push(
        `${MIGRATION}: the re-stated CHECK DROPS existing member '${m}'. A widen must be a TRUE ` +
          `SUPERSET — silently removing a member breaks every rule that uses it.`
      );
    }
  }
  if (!new RegExp(`'${REQUIRED_NEW}'`).test(body)) {
    problems.push(
      `${MIGRATION}: '${REQUIRED_NEW}' is not admitted. The accounting watchdog rules ` +
        `(orphan_bill_no_gl, orphan_payment_unapplied, stale_posting_batch, unbalanced_journal_entry) ` +
        `would again be rejected and kill the cron tick.`
    );
  }
  return problems;
}

function readAll() {
  return { [MIGRATION]: existsSync(MIGRATION) ? readFileSync(MIGRATION, "utf8") : null };
}

function selftest() {
  const failures = [];
  const t = (l, c) => { if (!c) failures.push(l); };
  const good = "ADD CONSTRAINT integrity_alerts_alert_category_check CHECK (x = ANY (ARRAY[" +
    [...PRIOR_MEMBERS, REQUIRED_NEW].map((m) => `'${m}'::text`).join(",") + "]))";

  t("full superset passes", analyse({ [MIGRATION]: good }).length === 0);
  t("dropping one prior member FAILS",
    analyse({ [MIGRATION]: good.replace("'unit_cost_anomaly'::text,", "") }).length === 1);
  // The REAL pre-fix state: the 12 without the new one.
  t("omitting accounting_integrity FAILS",
    analyse({ [MIGRATION]: good.replace(`,'${REQUIRED_NEW}'::text`, "") }).length === 1);
  t("dropping several members FAILS with one problem each",
    analyse({ [MIGRATION]: good.replace("'unit_cost_anomaly'::text,", "").replace("'driver_mpg_anomaly'::text,", "") }).length === 2);
  t("missing migration FAILS", analyse({ [MIGRATION]: null }).length === 1);
  t("no ADD CONSTRAINT FAILS", analyse({ [MIGRATION]: "-- just a comment about accounting_integrity" }).length === 1);

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:\n  - ${failures.join("\n  - ")}`);
    process.exit(1);
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  selftest();
  console.log(`${LABEL} selftest OK — 6 cases (1 pass-shape, 5 fail-shapes incl. member-drop and the real defect)`);
  process.exit(0);
}
const problems = analyse(readAll());
if (problems.length) {
  console.error(`${LABEL} FAILED:\n  - ${problems.join("\n  - ")}`);
  process.exit(1);
}
console.log(`${LABEL} OK — CHECK is a true superset of the prior 12 and admits accounting_integrity`);
