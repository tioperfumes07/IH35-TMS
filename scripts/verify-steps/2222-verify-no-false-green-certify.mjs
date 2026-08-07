export default {
  name: "verify-no-false-green-certify",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-no-false-green-certify.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-no-false-green-certify.mjs"]);
  },
};
