export default {
  name: "verify:driver-profile-dp2",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-profile-dp2.mjs"]);
  },
};
