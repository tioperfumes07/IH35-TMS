export default {
  name: "verify:no-combobox-listvendors-roster",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-no-combobox-listvendors-roster.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-no-combobox-listvendors-roster.mjs"]);
  },
};
