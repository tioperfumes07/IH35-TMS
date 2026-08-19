export default {
  name: "verify-save-load-template-modal-entitylinks",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-save-load-template-modal-entitylinks.mjs"]);
  },
};
