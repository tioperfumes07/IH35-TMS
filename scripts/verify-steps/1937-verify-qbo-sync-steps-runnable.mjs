export default {
  name: "verify-qbo-sync-steps-runnable",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-qbo-sync-steps-runnable.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-qbo-sync-steps-runnable.mjs"]);
  },
};
