export default {
  name: "verify:dead-combobox-imports",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-dead-combobox-imports.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-dead-combobox-imports.mjs"]);
  },
};
