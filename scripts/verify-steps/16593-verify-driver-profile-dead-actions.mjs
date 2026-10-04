export default {
  name: "verify:driver-profile-dead-actions",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-profile-dead-actions.mjs"]);
  },
};
