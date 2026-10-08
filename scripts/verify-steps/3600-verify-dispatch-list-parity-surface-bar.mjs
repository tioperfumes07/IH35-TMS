export default {
  name: "verify-dispatch-list-parity-surface-bar",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-dispatch-list-parity-surface-bar.mjs"]);
    // BANK leftover slate refuse piggyback (F91185)
    await ctx.run("node", ["scripts/verify-dispatch-list-eta-slate-leftover-chrome.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-dispatch-list-eta-slate-leftover-chrome.mjs"]);
  },
};
