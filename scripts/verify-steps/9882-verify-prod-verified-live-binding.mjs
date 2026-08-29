/** Cursor EVEN · claim 9882 on origin/main · verify-prod-verified-live-binding */
export default {
  name: "verify-prod-verified-live-binding",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-prod-verified-live-binding.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-prod-verified-live-binding.mjs"]);
  },
};
