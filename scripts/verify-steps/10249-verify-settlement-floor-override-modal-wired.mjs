export default {
  name: "verify-settlement-floor-override-modal-wired",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-settlement-floor-override-modal-wired.mjs"]);
  },
};
