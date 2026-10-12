export default {
  name: "verify-expense-number-never-null",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-expense-number-never-null.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-expense-number-never-null.mjs"]);
    // LEAD 443.129 E — a posted expense keeps its number through the ONE correction path (reverse + re-post, audited).
    await ctx.run("node", ["scripts/verify-posted-expense-correction-one-path.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-posted-expense-correction-one-path.mjs"]);
  },
};
