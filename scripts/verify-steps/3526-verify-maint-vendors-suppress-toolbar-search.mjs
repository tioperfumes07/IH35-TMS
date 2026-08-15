/** Verify-step 3526 — MAINT-F3526 maintenance vendors duplex Search suppress. */
export default {
  name: "verify-maint-vendors-suppress-toolbar-search",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-maint-vendors-suppress-toolbar-search.mjs"]);
  },
};
