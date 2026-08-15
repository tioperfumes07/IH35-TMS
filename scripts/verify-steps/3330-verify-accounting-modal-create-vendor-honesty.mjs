export default {
  name: "verify-accounting-modal-create-vendor-honesty",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-accounting-modal-create-vendor-honesty.mjs"]);
  },
};
