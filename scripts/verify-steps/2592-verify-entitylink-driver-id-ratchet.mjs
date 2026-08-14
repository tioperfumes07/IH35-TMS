// verify-entitylink-driver-id-ratchet — §9.0 item 17 pattern sweep
export default {
  name: "verify:driver-column-systemic-ratchets",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-entitylink-driver-id-ratchet.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-entitylink-driver-id-ratchet.mjs"]);
    await ctx.run("node", ["scripts/verify-wave-a-driver-built-claims-leaf-specific.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-wave-a-driver-built-claims-leaf-specific.mjs"]);
  },
};
