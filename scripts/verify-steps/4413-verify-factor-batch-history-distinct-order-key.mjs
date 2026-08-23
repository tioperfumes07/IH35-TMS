export default {
  name: "verify:factor-batch-history-distinct-order-key",
  run(ctx) {
    ctx.run("node", ["scripts/verify-factor-batch-history-distinct-order-key.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-factor-batch-history-distinct-order-key.mjs"]);
  },
};
