export default {
  name: "verify:entitypicker-filter-allowcreate-ratchet",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-entitypicker-filter-allowcreate-ratchet.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-entitypicker-filter-allowcreate-ratchet.mjs"]);
  },
};
