export default {
  name: "verify-kanban-compact-card-entitylinks",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-kanban-compact-card-entitylinks.mjs"]);
    // BANK-F91445 — C-23 kanban Dispatched → At pickup stamp (never ran in CI).
    await ctx.run("node", ["scripts/ops/verify-c23-kanban-dispatched-pickup.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-dispatch-miles-kanban-slate-leftover-chrome.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-dispatch-miles-kanban-slate-leftover-chrome.mjs"]);
  },
};
