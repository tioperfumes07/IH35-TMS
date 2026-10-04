export default {
  name: "verify:driver-profile-dp1-routes",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-profile-dp1-routes.mjs"]);
  },
};
