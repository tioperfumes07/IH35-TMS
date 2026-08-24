export default {
  name: "verify-geofence-dwell-cte-operating-company-id",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-geofence-dwell-cte-operating-company-id.mjs"]) !== 0) {
      throw new Error("verify-geofence-dwell-cte-operating-company-id failed");
    }
  },
};
