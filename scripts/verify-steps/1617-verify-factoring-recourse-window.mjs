// 1617 — FACT-02: Faro recourse window is 95 days off advanced_at (not 90 / created_at).
export default {
  name: "verify-factoring-recourse-window",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-factoring-recourse-window.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-factoring-recourse-window.mjs"]);
  },
};
