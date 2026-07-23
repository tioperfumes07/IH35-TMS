export default {
  name: "verify-acct-live-economics-evidence-pack",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-acct-live-economics-evidence-pack.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-acct-live-economics-evidence-pack.mjs"]);
  },
};
