export default {
  name: "verify-cust-link-02-coi-honest-empty",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-cust-link-02-coi-honest-empty.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-cust-link-02-coi-honest-empty.mjs"]);
  },
};
