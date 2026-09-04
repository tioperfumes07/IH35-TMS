export default {
  name: "verify-driver-bill-miles-basis-numeric",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-driver-bill-miles-basis-numeric.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-driver-bill-miles-basis-numeric.mjs"]);
  },
};
