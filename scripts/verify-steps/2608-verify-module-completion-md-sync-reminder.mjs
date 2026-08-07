// verify-module-completion-md-sync-reminder — §9.0 item 17 pattern sweep
export default {
  name: "verify:module-completion-md-sync-reminder",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-module-completion-md-sync-reminder.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-module-completion-md-sync-reminder.mjs"]);
  },
};
