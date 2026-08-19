export default {
  name: "verify-safety-accident-reverse-deep-link",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-safety-accident-reverse-deep-link.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-safety-accident-reverse-deep-link.mjs"]);
  },
};
