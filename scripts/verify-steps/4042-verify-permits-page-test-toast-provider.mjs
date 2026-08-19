export default {
  name: "verify-permits-page-test-toast-provider",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-permits-page-test-toast-provider.mjs"]);
  },
};
