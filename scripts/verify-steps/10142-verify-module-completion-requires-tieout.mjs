export default {
  name: "verify-module-completion-requires-tieout",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-module-completion-requires-tieout.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-module-completion-requires-tieout.mjs"]);
    await ctx.run("node", ["scripts/verify-intercompany-copy-integrity.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-intercompany-copy-integrity.mjs"]);
  },
};
