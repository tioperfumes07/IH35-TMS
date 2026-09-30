// X-16: only explicitly CI-wired, reviewed guards can move their DB phase.
// Do not infer safety from REQUIRES_LIVE_DB: some such guards INSERT fixtures.
export const CI_DATABASE_GUARDS = Object.freeze({
  'scripts/verify-g2-extra-pay-requires-item.mjs': '--selftest',
  'scripts/verify-telematics-feed-is-live.mjs': '--selftest',
  'scripts/verify-load-costs-wizard-amounts.mjs': '--static',
  'scripts/verify-one-load-create-path.mjs': '--static',
  'scripts/verify-workflow-requests-entity-scoped.mjs': '--selftest',
  'scripts/verify-no-auto-generated-account-numbers.mjs': '--static',
  'scripts/verify-driver-samsara-map-one-to-many.mjs': '--static',
  'scripts/verify-load-status-has-audit-event.mjs': null,
  'scripts/verify-void-stamp-columns.mjs': '--static',
  'scripts/verify-invoice-factor-profile-linkage.mjs': null,
  'scripts/verify-no-double-reversed-fuel-postings.mjs': null,
  'scripts/verify-voided-loads-hold-no-real-number.mjs': null,
  'scripts/verify-void-stamps-the-spec-liveness-column.mjs': null,
  'scripts/verify-reversed-jes-carry-header-linkage.mjs': null,
  'scripts/verify-cancelled-load-leaves-no-live-money.mjs': null,
  'scripts/verify-void-cascades-to-every-child.mjs': null,
  'scripts/verify-control-totals.mjs': null,
  'scripts/verify-alwaystrack-parity.mjs': null,
  'scripts/verify-settlement-net-equals-document.mjs': '--selftest',
  'scripts/verify-diesel-expense-fuel-dedupe.mjs': null,
  'scripts/verify-fuel-relay-txn-vendor-unmatched.mjs': '--selftest',
});

// These two entries were mistakenly grouped with live-domain checks. They still
// execute locally and their exit status still blocks; neither opens a database.
export const STATIC_DOMAIN_GUARDS = Object.freeze([
  'scripts/verify-bus-files-are-readable.mjs',
  'scripts/verify-gate-live-reads-use-ci-readonly.mjs',
]);

export function requiresLocalDatabase(file) {
  return !Object.hasOwn(CI_DATABASE_GUARDS, file) && !STATIC_DOMAIN_GUARDS.includes(file);
}

export function localDatabaseGuardArgs(args) {
  const mode = CI_DATABASE_GUARDS[args?.[0]];
  if (!Object.hasOwn(CI_DATABASE_GUARDS, args?.[0]) || (mode !== null && args.length !== 1)) return args;
  console.log(`DATABASE PHASE REQUIRED IN CI: ${args[0]}; ${mode ?? 'DEFERRED — no local execution'}, not live proof`);
  return mode ? [...args, mode] : null;
}
