export default {
  name: "verify-acct-bill-vendor-uuid-link",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-acct-bill-vendor-uuid-link.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-acct-bill-vendor-uuid-link.mjs"]);
  },
};
