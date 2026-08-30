/** ACCT-LINK-01 regression fix -- every live poster resolves+writes journal_entry_type_id. */
export default {
  name: "verify-je-type-id-wired-into-all-posters",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-je-type-id-wired-into-all-posters.mjs"]);
    await ctx.run("node", ["scripts/verify-je-type-id-wired-into-all-posters.mjs", "--selftest"]);
  },
};
