// verify-entitylink-vendor-id-ratchet — §9.0 item 17 pattern sweep
export default {
  name: "verify:vendor-column-systemic-ratchets",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-entitylink-vendor-id-ratchet.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-entitylink-vendor-id-ratchet.mjs"]);
    await ctx.run("node", ["scripts/verify-wave-a-vendor-built-claims-leaf-specific.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-wave-a-vendor-built-claims-leaf-specific.mjs"]);
  },
};
