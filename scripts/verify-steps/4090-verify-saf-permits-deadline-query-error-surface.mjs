export default {
  name: "verify-saf-permits-deadline-query-error-surface",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-saf-permits-deadline-query-error-surface.mjs"]);
  },
};
