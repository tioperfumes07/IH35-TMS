export default {
  name: "verify-no-claimed-numbers-edits",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-no-claimed-numbers-edits.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-no-claimed-numbers-edits.mjs"]);
  },
};
