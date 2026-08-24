export default {
  name: "verify-insurance-dashboard-excludes-fixture-data",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-insurance-dashboard-excludes-fixture-data.mjs"]) !== 0) {
      throw new Error("verify-insurance-dashboard-excludes-fixture-data failed");
    }
  },
};
