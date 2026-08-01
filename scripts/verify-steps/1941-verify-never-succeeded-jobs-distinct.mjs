export default {
  name: "verify-never-succeeded-jobs-distinct",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-never-succeeded-jobs-distinct.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-never-succeeded-jobs-distinct.mjs"]);
  },
};
