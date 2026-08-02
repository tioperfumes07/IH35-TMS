/** SAF-B08 — Escrow Record surfaces server has_signed_clause (no invented clause). */
export default {
  name: "verify-safety-b08-signed-clause-surface",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-safety-b08-signed-clause-surface.mjs"]);
    await ctx.run("node", ["scripts/verify-safety-b08-signed-clause-surface.mjs", "--selftest"]);
  },
};
