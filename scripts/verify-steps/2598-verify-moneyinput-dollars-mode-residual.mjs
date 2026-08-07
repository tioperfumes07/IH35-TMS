// verify-moneyinput-dollars-mode-residual — §9.0 item 17 pattern sweep
export default {
  name: "verify:moneyinput-dollars-mode-residual",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-moneyinput-dollars-mode-residual.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-moneyinput-dollars-mode-residual.mjs"]);
  },
};
