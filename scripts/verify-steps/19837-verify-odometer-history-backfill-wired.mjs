export default {
  name: "verify:odometer-history-backfill-wired",
  run(ctx) {
    ctx.run("node", ["scripts/verify-odometer-history-backfill-wired.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-odometer-history-backfill-wired.mjs"]);
  },
};
