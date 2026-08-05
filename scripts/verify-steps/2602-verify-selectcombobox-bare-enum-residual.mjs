// verify-selectcombobox-bare-enum-residual — §9.0 item 17 pattern sweep
export default {
  name: "verify:selectcombobox-bare-enum-residual",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-selectcombobox-bare-enum-residual.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-selectcombobox-bare-enum-residual.mjs"]);
  },
};
