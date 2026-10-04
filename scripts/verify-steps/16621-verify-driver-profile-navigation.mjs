export default {
  name: "verify:driver-profile-navigation",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-profile-navigation.mjs"]);
  },
};
