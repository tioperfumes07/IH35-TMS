export default {
  name: "verify-surface-bar-combobox-inventory",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-surface-bar-combobox-inventory.mjs"]);
  },
};
