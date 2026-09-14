export default {
  name: "verify-driver-bill-settlement-link",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-driver-bill-settlement-link.mjs"]);
  },
};
