export default {
  name: "verify-bill-expense-self-label-visible-round3",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-bill-expense-self-label-visible-round3.mjs"]) !== 0) {
      throw new Error("verify-bill-expense-self-label-visible-round3 failed");
    }
  },
};
