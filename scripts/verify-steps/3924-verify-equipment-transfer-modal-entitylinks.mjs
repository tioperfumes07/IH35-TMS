export default {
  name: "verify-equipment-transfer-modal-entitylinks",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-equipment-transfer-modal-entitylinks.mjs"]);
  },
};
