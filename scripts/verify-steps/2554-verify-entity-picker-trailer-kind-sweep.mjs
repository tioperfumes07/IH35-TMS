export default {
  name: "verify-trailer-column-systemic-ratchets",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-entity-picker-trailer-kind-sweep.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-entity-picker-trailer-kind-sweep.mjs"]);
    await ctx.run("node", ["scripts/verify-wave-a-trailer-built-claims-leaf-specific.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-wave-a-trailer-built-claims-leaf-specific.mjs"]);
  },
};
