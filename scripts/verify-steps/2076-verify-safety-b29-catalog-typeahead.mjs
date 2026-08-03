/** SAF-B29 wave-4 — civil / company / DOT-HOS catalog pickers server-search. */
export default {
  name: "verify-safety-b29-catalog-typeahead",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-safety-b29-catalog-typeahead.mjs"]);
    await ctx.run("node", ["scripts/verify-safety-b29-catalog-typeahead.mjs", "--selftest"]);
  },
};
