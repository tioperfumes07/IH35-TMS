export default {
  name: "verify-codex-vertical-nonmoney-zero-remainder",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-codex-vertical-nonmoney-zero-remainder.mjs"]);
    await ctx.run("node", ["scripts/verify-maintenance-design-law.mjs"]);
    await ctx.run("node", ["scripts/verify-fleet-table-header-design-contract.mjs"]);
  },
};
