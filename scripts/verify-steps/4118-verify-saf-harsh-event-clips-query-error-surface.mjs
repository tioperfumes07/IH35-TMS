export default {
  name: "verify-saf-harsh-event-clips-query-error-surface",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-saf-harsh-event-clips-query-error-surface.mjs"]);
  },
};
