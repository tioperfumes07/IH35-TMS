export default {
  name: "verify-c9-form-fields-wired",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-c9-form-fields-wired.mjs"]);
  },
};
