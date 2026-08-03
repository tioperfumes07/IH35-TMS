/** SAF-B29 wave-5 — Complaints / Internal Fines / Escrow draw-reason server typeahead. */
export default {
  name: "verify-safety-b29-wave5-typeahead",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-safety-b29-wave5-typeahead.mjs"]);
    await ctx.run("node", ["scripts/verify-safety-b29-wave5-typeahead.mjs", "--selftest"]);
  },
};
