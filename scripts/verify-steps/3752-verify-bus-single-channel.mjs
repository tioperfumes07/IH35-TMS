export default {
  name: "verify-bus-single-channel",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-bus-single-channel.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-bus-single-channel.mjs"]);
  },
};
