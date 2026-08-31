export default {
  name: "verify-live-load-number-not-self-referential",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-live-load-number-not-self-referential.mjs"]);
  },
};
