// Migration ledger hygiene — fails when _system/_schema_migrations or ih35_migrations.applied_migrations
// reference SQL files no longer on disk (orphan ledger entries). Was package.json-only; Rule 17 wiring.
export default {
  name: "verify-no-orphan-migration-ledger-entries",
  run(ctx) {
    ctx.ensureDatabaseUrl();
    if (ctx.run("node", ["scripts/verify-no-orphan-migration-ledger-entries.mjs"]) !== 0) {
      throw new Error("verify-no-orphan-migration-ledger-entries failed");
    }
  },
};
