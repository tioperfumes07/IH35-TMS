// verify-referenceselect-createkind-coverage-gaps — §9.0 item 17 pattern sweep
export default {
  name: "verify:referenceselect-createkind-coverage-gaps",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-referenceselect-createkind-coverage-gaps.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-referenceselect-createkind-coverage-gaps.mjs"]);
  },
};
