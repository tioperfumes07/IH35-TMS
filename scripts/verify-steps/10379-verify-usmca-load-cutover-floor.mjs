export default {
  name: "verify-usmca-load-cutover-floor",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-usmca-load-cutover-floor.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-usmca-load-cutover-floor.mjs"]);
  },
};
