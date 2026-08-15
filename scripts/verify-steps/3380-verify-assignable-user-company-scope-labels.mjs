export default {
  name: "verify-assignable-user-company-scope-labels",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-assignable-user-company-scope-labels.mjs"]);
  },
};
