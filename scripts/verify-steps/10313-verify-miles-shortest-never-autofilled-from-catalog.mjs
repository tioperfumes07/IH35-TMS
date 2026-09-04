export default {
  name: "verify-miles-shortest-never-autofilled-from-catalog",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-miles-shortest-never-autofilled-from-catalog.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-miles-shortest-never-autofilled-from-catalog.mjs"]);
  },
};
