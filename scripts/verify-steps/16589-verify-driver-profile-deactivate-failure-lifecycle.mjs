export default {
  name: "verify:driver-profile-deactivate-failure-lifecycle",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-profile-deactivate-failure-lifecycle.mjs"]);
  },
};
