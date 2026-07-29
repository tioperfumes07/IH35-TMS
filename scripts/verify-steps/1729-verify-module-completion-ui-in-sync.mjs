// Step 1729 — the in-app Module Completion scoreboard must match docs/module-completion/*.json,
// and its "first 14" must match the real sidebar order. A screen showing stale progress is worse
// than no screen, because it is believed.
export default {
  name: "verify:module-completion-ui-in-sync",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-module-completion-ui-in-sync.mjs"]);
  },
};
