export default {
  name: "verify-accounting-register-lists-suppress-toolbar-search",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-accounting-register-lists-suppress-toolbar-search.mjs"]);
  },
};
