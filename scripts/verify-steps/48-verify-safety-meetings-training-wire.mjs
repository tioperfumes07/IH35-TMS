export default {
  name: "verify-safety-meetings-training-wire",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-safety-meetings-training-wire.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-safety-meetings-training-wire.mjs"]);
  },
};
