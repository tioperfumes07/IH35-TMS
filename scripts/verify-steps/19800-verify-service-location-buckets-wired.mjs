export default {
  name: "verify:service-location-buckets-wired",
  run(ctx) {
    ctx.run("node", ["scripts/verify-service-location-buckets-wired.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-service-location-buckets-wired.mjs"]);
  },
};
