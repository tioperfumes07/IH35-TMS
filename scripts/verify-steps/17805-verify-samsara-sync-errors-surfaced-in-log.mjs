export default {
  name: "verify:samsara-sync-errors-surfaced-in-log",
  run(ctx) {
    ctx.run("node", ["scripts/verify-samsara-sync-errors-surfaced-in-log.mjs"]);
  },
};
