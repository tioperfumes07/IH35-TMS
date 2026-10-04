export default {
  name: "verify:bank-transaction-push-gate",
  run(ctx) {
    ctx.run("node", ["scripts/verify-bank-transaction-push-gate.mjs"]);
  },
};
