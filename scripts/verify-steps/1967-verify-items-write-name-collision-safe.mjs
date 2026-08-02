export default {
  name: "verify-items-write-name-collision-safe",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-items-write-name-collision-safe.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-items-write-name-collision-safe.mjs"]);
  },
};
