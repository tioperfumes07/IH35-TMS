export default {
  name: "verify:samsara-positions-cron-registered",
  run(ctx) {
    ctx.run("node", ["scripts/verify-samsara-positions-cron-registered.mjs"]);
  },
};
