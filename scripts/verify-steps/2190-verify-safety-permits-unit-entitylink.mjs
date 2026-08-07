export default {
  name: "verify-safety-permits-unit-entitylink",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-safety-permits-unit-entitylink.mjs"]);
  },
};
