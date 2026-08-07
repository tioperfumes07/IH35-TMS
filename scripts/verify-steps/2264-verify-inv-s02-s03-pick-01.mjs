export default {
  name: "verify-inv-s02-s03-pick-01",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-inv-s02-s03-pick-01.mjs"]);
  },
};
