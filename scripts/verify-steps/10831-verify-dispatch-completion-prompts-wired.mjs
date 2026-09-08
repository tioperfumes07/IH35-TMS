export default {
  name: "verify-dispatch-completion-prompts-wired",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-dispatch-completion-prompts-wired.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-dispatch-completion-prompts-wired.mjs"]);
  },
};
