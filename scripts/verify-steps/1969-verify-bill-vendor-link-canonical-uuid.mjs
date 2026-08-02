export default {
  name: "verify-bill-vendor-link-canonical-uuid",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-bill-vendor-link-canonical-uuid.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-bill-vendor-link-canonical-uuid.mjs"]);
  },
};
