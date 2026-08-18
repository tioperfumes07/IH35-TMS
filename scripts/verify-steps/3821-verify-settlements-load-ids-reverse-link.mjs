export default {
  name: "verify-settlements-load-ids-reverse-link",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-settlements-load-ids-reverse-link.mjs"]);
  },
};
