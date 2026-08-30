export default {
  name: "verify-coa-roles-unique-per-company-role",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-coa-roles-unique-per-company-role.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-coa-roles-unique-per-company-role.mjs"]);
  },
};
