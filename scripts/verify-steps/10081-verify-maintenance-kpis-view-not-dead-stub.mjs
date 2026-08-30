/** GO-1405 P1 -- views.maintenance_dashboard_kpis is no longer a permanent WHERE false stub. */
export default {
  name: "verify-maintenance-kpis-view-not-dead-stub",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-maintenance-kpis-view-not-dead-stub.mjs"]);
    await ctx.run("node", ["scripts/verify-maintenance-kpis-view-not-dead-stub.mjs", "--selftest"]);
  },
};
