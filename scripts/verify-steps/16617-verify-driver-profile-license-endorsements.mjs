export default {
  name: "verify:driver-profile-license-endorsements",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-profile-license-endorsements.mjs"]);
  },
};
