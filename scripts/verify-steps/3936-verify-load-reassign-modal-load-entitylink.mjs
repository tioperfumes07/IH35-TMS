export default {
  name: "verify-load-reassign-modal-load-entitylink",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-load-reassign-modal-load-entitylink.mjs"]);
  },
};
