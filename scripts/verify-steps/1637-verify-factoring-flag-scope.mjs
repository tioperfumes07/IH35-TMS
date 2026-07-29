/** FACT-01 — FACTORING_GL_POSTING_ENABLED arms for TRANSP + USMCA only; TRK forbidden. */
export default {
  name: "verify-factoring-flag-scope",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-factoring-flag-scope.mjs"]);
    await ctx.run("node", ["scripts/verify-factoring-flag-scope.mjs", "--selftest"]);
  },
};
