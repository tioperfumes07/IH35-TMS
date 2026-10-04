export default {
  name: "verify:expense-balance-invariant",
  run(ctx) {
    ctx.run("node", ["scripts/verify-expense-balance-invariant.mjs"]);
  },
};
