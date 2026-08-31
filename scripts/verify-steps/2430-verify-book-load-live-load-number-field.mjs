export default {
  name: "verify-book-load-live-load-number-field",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-book-load-live-load-number-field.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-book-load-live-load-number-field.mjs"]);
  },
};
