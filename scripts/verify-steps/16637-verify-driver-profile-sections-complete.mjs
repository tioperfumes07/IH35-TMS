export default {
  name: "verify:driver-profile-sections-complete",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-profile-sections-complete.mjs"]);
  },
};
