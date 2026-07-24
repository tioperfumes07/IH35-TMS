export default {
  name: "verify-refuse-qbo-bill-post-gl",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-refuse-qbo-bill-post-gl.mjs"]);
  },
};
