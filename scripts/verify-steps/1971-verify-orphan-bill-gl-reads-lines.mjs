export default {
  name: "verify-orphan-bill-gl-reads-lines",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-orphan-bill-gl-reads-lines.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-orphan-bill-gl-reads-lines.mjs"]);
  },
};
