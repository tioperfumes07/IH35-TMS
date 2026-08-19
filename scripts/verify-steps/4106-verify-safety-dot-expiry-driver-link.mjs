export default {
  name: "verify-safety-dot-expiry-driver-link",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-safety-dot-expiry-driver-link.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-safety-dot-expiry-driver-link.mjs"]);
  },
};
