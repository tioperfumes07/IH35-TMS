export default {
  name: "verify-load-status-single-state-machine",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-load-status-single-state-machine.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-load-status-single-state-machine.mjs"]);
  },
};
