export default {
  name: "verify-maintenance-dashboard-kpis-excludes-sample-data",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-maintenance-dashboard-kpis-excludes-sample-data.mjs"]) !== 0) {
      throw new Error("verify-maintenance-dashboard-kpis-excludes-sample-data failed");
    }
  },
};
