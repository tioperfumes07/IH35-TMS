/** CC-2 — ACC-19. Guards the per-detector SAVEPOINT/ROLLBACK-TO-SAVEPOINT/RELEASE-SAVEPOINT
 * isolation fix in runLedgerIntegrityTick against regressing back to a bare try/catch (which looks
 * isolated but leaves the shared transaction aborted for every later detector and company once one
 * detector's query throws — live-confirmed as the actual reason most of
 * LAW-TRANSACTION-HEALTH-REGISTER-2026-09-01's checks had never completed since before 2026-09-01).
 * Also guards the detectors array itself against silently losing a registered check — the
 * "written but never run" pattern this session found repeatedly. */
export default {
  name: "verify-ledger-integrity-savepoint-isolation-and-registry",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-ledger-integrity-savepoint-isolation-and-registry.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-ledger-integrity-savepoint-isolation-and-registry.mjs"]);
  },
};
