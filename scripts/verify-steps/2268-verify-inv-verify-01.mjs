export default {
  name: "verify-inv-verify-01",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-inv-verify-01.mjs"]);
  },
};
