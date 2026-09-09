export default {
  name: "verify-reefer-lumper-confirmation-captured",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-reefer-lumper-confirmation-captured.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-reefer-lumper-confirmation-captured.mjs"]);
  },
};
