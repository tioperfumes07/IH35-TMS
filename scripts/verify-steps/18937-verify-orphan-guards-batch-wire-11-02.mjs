// 18937 (Claude Lead, 2026-11-02) — 30 guards were merged on 11-02 without wiring (verify-guard-wired red on main and every
// PR: locked-guards-heavy). Each one passes BOTH a plain run and --selftest without a database (measured on main 21:25Z),
// so each is EXECUTED here, not merely named. Any failure fails the step with the guard's own name.
const GUARDS = [
  "verify-accounting-hub-aging-u30.mjs",
  "verify-cashflow-home-matrix-drill.mjs",
  "verify-cashflow-home-money-date-format.mjs",
  "verify-cashflow-rolling-ledger-chip-date.mjs",
  "verify-company-driver-picker-u29.mjs",
  "verify-cursor-surfaces-datetime-format.mjs",
  "verify-customer-document-scopes-distinct.mjs",
  "verify-detention-approval-queue-u29.mjs",
  "verify-dispatch-datetime-format-wave2.mjs",
  "verify-dispatch-fuel-datetime-format.mjs",
  "verify-dispatch-load-costs-panel-u29.mjs",
  "verify-dispatch-u29-queue-entity-links.mjs",
  "verify-driver-audit-datetime-format.mjs",
  "verify-eng17-faro-1090-proposal-build-only.mjs",
  "verify-expenses-receipt-attach-no-fanout.mjs",
  "verify-factoring-purchase-report-debtor-filter.mjs",
  "verify-factoring-queue-u29-factor-links.mjs",
  "verify-faro-debtor-u29-entity-links.mjs",
  "verify-fleet-covered-dates-format.mjs",
  "verify-fuel-integrity-u29-entity-links.mjs",
  "verify-fuel-relay-deposit-format.mjs",
  "verify-geofences-deeplink-beyond-page.mjs",
  "verify-money-list-kpi-card-shows-value.mjs",
  "verify-pod-review-status-multiselect.mjs",
  "verify-qbo-home-expenses-ap-buckets.mjs",
  "verify-reclassify-u19-no-unscoped-autoload.mjs",
  "verify-report-preset-atomic-url.mjs",
  "verify-tasks-mine-status-multiselect.mjs",
  "verify-trip-pairing-customer-miles-revenue.mjs",
  "verify-vendor-customer-txn-status-multiselect.mjs",
];

export default {
  name: "verify-orphan-guards-batch-wire-11-02",
  run(ctx) {
    const failed = [];
    for (const guard of GUARDS) {
      if (ctx.run("node", [`scripts/${guard}`]) !== 0) failed.push(`${guard} (run)`);
      if (ctx.run("node", [`scripts/${guard}`, "--selftest"]) !== 0) failed.push(`${guard} (--selftest)`);
    }
    if (failed.length) throw new Error(`verify-orphan-guards-batch-wire-11-02 failed: ${failed.join(", ")}`);
  },
};
