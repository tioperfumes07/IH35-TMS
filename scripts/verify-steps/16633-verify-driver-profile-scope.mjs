export default {
  name: "verify:driver-profile-scope",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-profile-scope.mjs"]);
  },
};
