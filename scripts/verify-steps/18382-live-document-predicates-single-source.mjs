/** ROUND 443.213; claim merged in #27098 before authorship. Static only. */
export default {
  name: "verify-live-document-predicates-single-source",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-live-document-predicates-single-source.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-live-document-predicates-single-source.mjs"]);
    await ctx.run("node", ["scripts/verify-usmca-live-document-state.mjs", "--selftest"]);
  },
};
