export default {
  name: "verify:audit-chain-cron-registered",
  run(ctx) {
    ctx.run("node", ["scripts/verify-audit-chain-cron-registered.mjs"]);
  },
};
