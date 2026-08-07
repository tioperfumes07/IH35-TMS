export default {
  name: "verify:listcustomers-combobox-without-referenceselect",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-listcustomers-combobox-without-referenceselect.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-listcustomers-combobox-without-referenceselect.mjs"]);
  },
};
