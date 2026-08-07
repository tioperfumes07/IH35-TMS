export default {
  name: "verify:listvendors-combobox-without-referenceselect",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-listvendors-combobox-without-referenceselect.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-listvendors-combobox-without-referenceselect.mjs"]);
  },
};
