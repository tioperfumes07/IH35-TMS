export default {
  name: "verify-reports-scheduled-custom-raw-chrome-delete",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-reports-scheduled-custom-raw-chrome-delete.mjs"]);
  },
};
