export default {
  name: "verify:load-column-systemic-ratchets",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-entitylink-load-id-ratchet.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-entitylink-load-id-ratchet.mjs"]);
    await ctx.run("node", ["scripts/verify-wave-a-load-built-claims-leaf-specific.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-wave-a-load-built-claims-leaf-specific.mjs"]);
  },
};
