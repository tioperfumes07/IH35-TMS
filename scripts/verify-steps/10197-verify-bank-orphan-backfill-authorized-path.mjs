// BANK-ORPHAN-01 backfill (owner ruling 2026-08-31/2026-09-01). Step 10197 · CC-1 lane.
export default {
  name: "bank-orphan-backfill-authorized-path",
  run(ctx) {
    ctx.run("node", ["scripts/verify-bank-orphan-backfill-authorized-path.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-bank-orphan-backfill-authorized-path.mjs"]);
  },
};
