export default {
  name: "verify-coa-role-values-registered-in-check-constraint",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-coa-role-values-registered-in-check-constraint.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-coa-role-values-registered-in-check-constraint.mjs"]);
  },
};
