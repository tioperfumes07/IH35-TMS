export default {
  name: "verify-settlement-edit-deduction-wired",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-settlement-edit-deduction-wired.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-settlement-edit-deduction-wired.mjs"]);
  },
};
