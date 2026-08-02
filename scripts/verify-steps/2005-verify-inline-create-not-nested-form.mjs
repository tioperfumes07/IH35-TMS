export default {
  name: "verify-inline-create-not-nested-form",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-inline-create-not-nested-form.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-inline-create-not-nested-form.mjs"]);
  },
};
