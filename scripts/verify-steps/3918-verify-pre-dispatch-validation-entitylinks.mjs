export default {
  name: "verify-pre-dispatch-validation-entitylinks",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-pre-dispatch-validation-entitylinks.mjs"]);
  },
};
