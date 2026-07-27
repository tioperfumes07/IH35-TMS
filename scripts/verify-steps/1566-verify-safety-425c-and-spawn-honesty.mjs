export default {
  name: "verify-safety-425c-and-spawn-honesty",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-safety-425c-and-spawn-honesty.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-safety-425c-and-spawn-honesty.mjs"]);
  },
};
