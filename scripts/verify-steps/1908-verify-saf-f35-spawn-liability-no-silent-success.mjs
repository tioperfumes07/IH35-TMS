export default {
  name: "verify-saf-f35-spawn-liability-no-silent-success",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-saf-f35-spawn-liability-no-silent-success.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-saf-f35-spawn-liability-no-silent-success.mjs"]);
  },
};
