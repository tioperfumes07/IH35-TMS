export default {
  name: "verify-bus-single-channel",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-bus-single-channel.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-bus-single-channel.mjs"]);
    await ctx.run("node", ["scripts/verify-91093-items-posttmpl-finmodtabs-slate-leftover-chrome.mjs"]);
  },
};
