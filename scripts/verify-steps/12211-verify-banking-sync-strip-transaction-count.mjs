export default {
  name: "verify:banking-sync-strip-transaction-count",
  run(ctx) {
    ctx.run("node", ["scripts/verify-banking-sync-strip-transaction-count.mjs"]);
  },
};
