export default {
  name: "verify:plaid-cron-registered",
  run(ctx) {
    ctx.run("node", ["scripts/verify-plaid-cron-registered.mjs"]);
  },
};
