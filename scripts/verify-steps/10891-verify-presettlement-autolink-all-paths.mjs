export default {
  name: "verify:presettlement-autolink-all-paths",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-presettlement-autolink-all-paths.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-presettlement-autolink-all-paths.mjs"]);
    await ctx.run("node", ["scripts/verify-reg010-011-settlement-identity.mjs"]);
    await ctx.run("node", ["scripts/verify-settlement-sweep-pre-list.mjs"]);
  },
};
