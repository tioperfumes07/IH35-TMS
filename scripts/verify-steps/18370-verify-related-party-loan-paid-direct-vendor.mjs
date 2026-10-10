export default {
  name: "verify-related-party-loan-paid-direct-vendor",
  async run(ctx) {
    await ctx.run("node", [
      "scripts/verify-related-party-loan-paid-direct-vendor.mjs",
      "--selftest",
    ]);
    await ctx.run("node", ["scripts/verify-related-party-loan-paid-direct-vendor.mjs"]);
  },
};
