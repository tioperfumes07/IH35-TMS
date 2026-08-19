export default {
  name: "verify-quick-assign-modal-entitylinks",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-quick-assign-modal-entitylinks.mjs"]);
  },
};
