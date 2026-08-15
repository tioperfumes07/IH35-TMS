export default {
  name: "verify-moneyinput-single-frame-vertical",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-moneyinput-single-frame-vertical.mjs"]);
  },
};
