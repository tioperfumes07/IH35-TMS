export default {
  name: "verify:odometer-ledger-has-one-writer",
  run(ctx) {
    ctx.run("node", ["scripts/verify-odometer-ledger-has-one-writer.mjs"]);
  },
};
