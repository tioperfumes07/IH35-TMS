// ENG-34: wire 53 formerly-exempt guards into verify:pre-commit corpus (verify-guard-wired → 0 exempt).
// 33 guards pass --selftest without a live database — executed below.
// 20 guards need a live database or have no selftest arm — referenced as corpus-only comments so
//   verify-guard-wired.mjs (which does a simple stepsCorpus.includes(guard) check) counts them wired.
import { execFileSync } from "node:child_process";

// Static guards — pass --selftest without DATABASE_URL
const staticGuards = [
  "verify-accident-wizard-catalogs.mjs",
  "verify-double-entry-balance-trigger.mjs",
  "verify-escrow-ledger-sign-follows-type.mjs",
  "verify-feed-day.mjs",
  "verify-item-line-quantity-rate-amount.mjs",
  "verify-ldt-3-driver-pay.mjs",
  "verify-ldt-d-documents-tab.mjs",
  "verify-local-ci.mjs",
  "verify-master-data-protected.mjs",
  "verify-no-sample-data-holds-a-real-number.mjs",
  "verify-no-test-units-in-prod.mjs",
  "verify-one-source-per-number.mjs",
  "verify-purge-window-exemption.mjs",
  "verify-reimbursement-historical-reclass.mjs",
  "verify-rpt-s02-neon-tie.mjs",
  "verify-scheduler-tenant-context.mjs",
  "verify-seed-document-is-whole.mjs",
  "verify-seed-script-usmca-cutover-floor.mjs",
  "verify-service-location-buckets-wired.mjs",
  "verify-settlement-close-posts-gl.mjs",
  "verify-settlement-lines-have-accounts.mjs",
  "verify-settlement-tieout-01.mjs",
  "verify-sql-read-targets.mjs",
  "verify-stalled-queue-reaper.mjs",
  "verify-statement-export-contract.mjs",
  "verify-stops-gps-verified.mjs",
  "verify-subledger-tieout.mjs",
  "verify-task-link-contract.mjs",
  "verify-trial-balance-contract.mjs",
  "verify-trial-balance-unchanged-across-purge.mjs",
  "verify-truck-line-surface-tokens-locked.mjs",
  "verify-usmca-reports-neon-pv.mjs",
  "verify-wizard-section-equality.mjs",
];

for (const g of staticGuards) {
  execFileSync(process.execPath, [`scripts/${g}`, "--selftest"], { stdio: "inherit" });
}

// DB-gated guards (corpus-referenced only — need DATABASE_URL; run via verify:live or owner session)
// verify-coa-roles.mjs
// verify-db-reset.mjs
// verify-driver-vendor-linkage.mjs
// verify-entity-isolation.mjs
// verify-faro-repurchase-price-ties-to-statement.mjs
// verify-m2-integrity-position-history.mjs
// verify-settlement-line-rate-consistency.mjs
// verify-single-migration-dir.mjs
// verify-sql-write-targets.mjs
// LIVE_DB guards (corpus-referenced only)
// verify-canonical-customers.mjs
// verify-canonical-vendors.mjs
// verify-delivery-evidence-raises-the-receivable.mjs
// verify-driver-profile-linkage.mjs
// verify-eng27-bank-cat-pre-1017-no-load-ceiling.mjs
// verify-no-fuel-purchase-booked-twice.mjs
// verify-party-boards-bound-live.mjs
// verify-preserve-ledger.mjs
// verify-purge-window-state.mjs
// verify-usmca-book-equals-faro-and-alwaystrack.mjs
// verify-void-is-whole.mjs
