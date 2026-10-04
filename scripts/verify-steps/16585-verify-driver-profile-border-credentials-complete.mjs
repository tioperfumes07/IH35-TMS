export default {
  name: "verify:driver-profile-border-credentials-complete",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-profile-border-credentials-complete.mjs"]);
  },
};
