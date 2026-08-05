// verify-no-combobox-listworkorders-roster — §9.0 item 17 pattern sweep
export default {
  name: "verify:no-combobox-listworkorders-roster",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-no-combobox-listworkorders-roster.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-no-combobox-listworkorders-roster.mjs"]);
  },
};
