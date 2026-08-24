export default {
  name: "verify-home-fleet-utilization-excludes-sample-data",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-home-fleet-utilization-excludes-sample-data.mjs"]) !== 0) {
      throw new Error("verify-home-fleet-utilization-excludes-sample-data failed");
    }
  },
};
