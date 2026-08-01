export default {
  name: "verify-office-delivery-stamps-stop-evidence",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-office-delivery-stamps-stop-evidence.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-office-delivery-stamps-stop-evidence.mjs"]);
  },
};
