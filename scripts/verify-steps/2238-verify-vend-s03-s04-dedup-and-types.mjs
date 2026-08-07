export default {
  name: "verify-vend-s03-s04-dedup-and-types",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-vend-s03-s04-dedup-and-types.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-vend-s03-s04-dedup-and-types.mjs"]);
  },
};
