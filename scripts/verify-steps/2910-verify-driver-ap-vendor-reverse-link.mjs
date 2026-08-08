export default {
  name: "verify-driver-ap-vendor-reverse-link",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-driver-ap-vendor-reverse-link.mjs"]);
  },
};
