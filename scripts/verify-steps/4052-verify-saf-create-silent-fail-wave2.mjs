export default {
  name: "verify-saf-create-silent-fail-wave2",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-saf-create-silent-fail-wave2.mjs"]);
  },
};
