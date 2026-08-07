// verify-no-combobox-listfactoringadvances-roster — §9.0 item 17 pattern sweep
export default {
  name: "verify:no-combobox-listfactoringadvances-roster",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-no-combobox-listfactoringadvances-roster.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-no-combobox-listfactoringadvances-roster.mjs"]);
  },
};
