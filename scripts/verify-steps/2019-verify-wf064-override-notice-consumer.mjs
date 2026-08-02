export default {
  name: "verify-wf064-override-notice-consumer",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-wf064-override-notice-consumer.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-wf064-override-notice-consumer.mjs"]);
  },
};
