export default {
  name: "verify-bill-human-reference",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-bill-human-reference.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-bill-human-reference.mjs"]);
  },
};
