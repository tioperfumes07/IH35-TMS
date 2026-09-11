export default {
  name: "verify-cancel-load-terminal-status-greyout",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-cancel-load-terminal-status-greyout.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-cancel-load-terminal-status-greyout.mjs"]);
  },
};
