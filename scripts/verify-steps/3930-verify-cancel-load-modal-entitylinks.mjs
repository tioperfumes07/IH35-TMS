export default {
  name: "verify-cancel-load-modal-entitylinks",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-cancel-load-modal-entitylinks.mjs"]);
  },
};
