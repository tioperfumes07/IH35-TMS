export default {
  name: "verify-dispatcher-safety-events-reverse",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-dispatcher-safety-events-reverse.mjs"]);
  },
};
