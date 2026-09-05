export default {
  name: "verify-google-reference-miles",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-google-reference-miles.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-google-reference-miles.mjs"]);
  },
};
