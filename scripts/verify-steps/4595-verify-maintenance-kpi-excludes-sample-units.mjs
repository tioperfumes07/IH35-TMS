export default {
  name: "verify-maintenance-kpi-excludes-sample-units",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-maintenance-kpi-excludes-sample-units.mjs"]) !== 0) {
      throw new Error("verify-maintenance-kpi-excludes-sample-units failed");
    }
  },
};
