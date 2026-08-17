export default {
  name: "verify-program-gated-no-owner-hold-copy",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-program-gated-no-owner-hold-copy.mjs"]);
  },
};
