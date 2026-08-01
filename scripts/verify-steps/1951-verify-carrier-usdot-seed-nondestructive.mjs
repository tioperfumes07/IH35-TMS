export default {
  name: "verify-carrier-usdot-seed-nondestructive",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-carrier-usdot-seed-nondestructive.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-carrier-usdot-seed-nondestructive.mjs"]);
  },
};
