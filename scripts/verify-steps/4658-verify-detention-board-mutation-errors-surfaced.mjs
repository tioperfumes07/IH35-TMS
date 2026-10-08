export default {
  name: "verify-detention-board-mutation-errors-surfaced",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-detention-board-mutation-errors-surfaced.mjs"]);
    // BANK leftover slate refuse piggyback (F91183)
    await ctx.run("node", ["scripts/verify-dot-detention-assign-slate-leftover-chrome.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-dot-detention-assign-slate-leftover-chrome.mjs"]);
  },
};
