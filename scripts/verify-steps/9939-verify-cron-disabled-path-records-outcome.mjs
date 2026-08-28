export default {
  name: "verify:cron-disabled-path-records-outcome",
  run(ctx) {
    ctx.run("node", ["scripts/verify-cron-disabled-path-records-outcome.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-cron-disabled-path-records-outcome.mjs"]);
  },
};
