/** Escrow forfeit — assertCompanyMembership(client) before every caller-derived GUC. */
export default {
  name: "verify-escrow-forfeit-membership-before-guc",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-escrow-forfeit-membership-before-guc.mjs"]);
    await ctx.run("node", ["scripts/verify-escrow-forfeit-membership-before-guc.mjs", "--selftest"]);
  },
};
