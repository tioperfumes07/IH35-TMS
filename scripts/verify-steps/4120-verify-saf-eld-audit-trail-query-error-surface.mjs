export default {
  name: "verify-saf-eld-audit-trail-query-error-surface",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-saf-eld-audit-trail-query-error-surface.mjs"]);
  },
};
