/** LST-COUNT-01 — a badge that silently understates looks authoritative while being wrong. */
export default {
  name: "verify-lists-badge-counts-every-live-catalog",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-lists-badge-counts-every-live-catalog.mjs"]);
    await ctx.run("node", ["scripts/verify-lists-badge-counts-every-live-catalog.mjs", "--selftest"]);
  },
};
