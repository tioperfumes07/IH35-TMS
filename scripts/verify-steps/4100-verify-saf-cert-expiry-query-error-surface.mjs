export default {
  name: "verify-saf-cert-expiry-query-error-surface",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-saf-cert-expiry-query-error-surface.mjs"]);
  },
};
