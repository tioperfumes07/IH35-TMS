// GUARD-WIRE-93 companion (Cursor, ROUND 12). NOT a guard, NOT a verify-step — do not move
// under scripts/ top-level or scripts/verify-steps/. Holds the 14 orphan guards that FAIL
// standalone so the batch step's --selftest can assert none is smuggled into the wired list.
// These stay unwired/OPEN (Devin ENV-CENSUS-FAIL-01..14) until their owning seat fixes the defect.
export const KNOWN_FAILING = [
  "verify-book-load-footer-save-controls.mjs",
  "verify-broker-advance-never-driver-liability-never-invoice-face.mjs",
  "verify-catalog-lists-voided-toggle.mjs",
  "verify-counterparty-landing-polish.mjs",
  "verify-fleet-oos-columns-manifest.mjs",
  "verify-lists-reports-sort-law.mjs",
  "verify-load-costs-board-manifest.mjs",
  "verify-load-costs-drawer-wide.mjs",
  "verify-report-export-parity.mjs",
  "verify-reports-dash-never-zero.mjs",
  "verify-round-trips-deep-link-timeline-and-empty-copy.mjs",
  "verify-samsara-roster-status-filter.mjs",
  "verify-settlement-deduction-void-branches.mjs",
  "verify-settlement-lines-driver-bill-miles-rate-join.mjs",
];
