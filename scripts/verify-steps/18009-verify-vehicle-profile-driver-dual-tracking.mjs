export default {
  name: "verify:vehicle-profile-driver-dual-tracking",
  run(ctx) {
    ctx.run("node", ["scripts/verify-vehicle-profile-driver-dual-tracking.mjs"]);
  },
};
