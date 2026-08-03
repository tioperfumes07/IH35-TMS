/** SAF-B29 — Driver Safety Cards roster server-search. */
export default {
  name: "verify-safety-b29-driver-cards-search",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-safety-b29-driver-cards-search.mjs"]);
    await ctx.run("node", ["scripts/verify-safety-b29-driver-cards-search.mjs", "--selftest"]);
  },
};
