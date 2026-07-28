/** C11 — two catalogs claiming to be "the IFTA jurisdiction list" is a permanent split-brain risk. */
export default {
  name: "verify-ifta-single-canonical-catalog",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-ifta-single-canonical-catalog.mjs"]);
    await ctx.run("node", ["scripts/verify-ifta-single-canonical-catalog.mjs", "--selftest"]);
  },
};
