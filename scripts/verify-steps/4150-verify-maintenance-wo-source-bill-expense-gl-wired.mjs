// Verify the maintenance work-order financial linkage and the authoritative
// in-shop condition feed as one maintenance vertical. Static, no DB.
export default {
  name: "verify-maintenance-wo-source-bill-expense-gl-wired",
  run(ctx) {
    ctx.run("node", ["scripts/verify-maintenance-wo-source-bill-expense-gl-wired.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-maintenance-wo-source-bill-expense-gl-wired.mjs"]);
    ctx.run("node", ["scripts/verify-maintenance-fleet-table-complete-status-feed.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-maintenance-fleet-table-complete-status-feed.mjs"]);
  },
};
