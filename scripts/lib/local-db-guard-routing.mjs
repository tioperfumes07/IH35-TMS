// X-16: only explicitly CI-wired, reviewed guards can move their DB phase.
// Do not infer safety from REQUIRES_LIVE_DB: some such guards INSERT fixtures.
export const CI_DATABASE_GUARDS = Object.freeze({
  'scripts/verify-one-load-create-path.mjs': '--static',
  'scripts/verify-workflow-requests-entity-scoped.mjs': '--selftest',
  'scripts/verify-no-auto-generated-account-numbers.mjs': '--static',
  'scripts/verify-driver-samsara-map-one-to-many.mjs': '--static',
  'scripts/verify-load-status-has-audit-event.mjs': '--static',
  'scripts/verify-void-stamp-columns.mjs': '--static',
  'scripts/verify-invoice-factor-profile-linkage.mjs': null,
  'scripts/verify-no-double-reversed-fuel-postings.mjs': null,
  'scripts/verify-voided-loads-hold-no-real-number.mjs': null,
  'scripts/verify-void-stamps-the-spec-liveness-column.mjs': null,
  'scripts/verify-reversed-jes-carry-header-linkage.mjs': null,
  'scripts/verify-cancelled-load-leaves-no-live-money.mjs': null,
  'scripts/verify-void-cascades-to-every-child.mjs': null,
});

export function localDatabaseGuardArgs(args) {
  const mode = CI_DATABASE_GUARDS[args?.[0]];
  if (!Object.hasOwn(CI_DATABASE_GUARDS, args?.[0]) || (mode !== null && args.length !== 1)) return args;
  console.log(`DATABASE PHASE REQUIRED IN CI: ${args[0]}; ${mode ?? 'DEFERRED — no local execution'}, not live proof`);
  return mode ? [...args, mode] : null;
}
