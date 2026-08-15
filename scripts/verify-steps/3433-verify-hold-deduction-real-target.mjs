export default {
  name: "verify-hold-deduction-real-target",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-hold-deduction-real-target.mjs"]);
  },
};
