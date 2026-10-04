export default {
  name: "verify:driver-profile-default-truck-symmetry",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-profile-default-truck-symmetry.mjs"]);
  },
};
