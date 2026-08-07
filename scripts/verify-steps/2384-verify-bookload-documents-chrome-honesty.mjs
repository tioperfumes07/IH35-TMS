export default {
  name: "verify-bookload-documents-chrome-honesty",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-bookload-documents-chrome-honesty.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-bookload-documents-chrome-honesty.mjs"]);
  },
};
