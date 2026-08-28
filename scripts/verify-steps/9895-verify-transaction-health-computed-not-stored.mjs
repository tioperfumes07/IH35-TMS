export default {
  name: "verify:transaction-health-computed-not-stored",
  run(ctx) {
    ctx.run("node", ["scripts/verify-transaction-health-computed-not-stored.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-transaction-health-computed-not-stored.mjs"]);
  },
};
