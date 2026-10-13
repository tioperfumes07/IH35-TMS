export default {
  name: "verify-refuse-qbo-bill-post-gl",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-refuse-qbo-bill-post-gl.mjs"]);
    await ctx.run("node", ["scripts/verify-native-document-gl-independent-of-qbo.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-native-document-gl-independent-of-qbo.mjs"]);
  },
};
