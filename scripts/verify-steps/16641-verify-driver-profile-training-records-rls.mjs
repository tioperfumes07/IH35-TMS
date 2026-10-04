export default {
  name: "verify:driver-profile-training-records-rls",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-profile-training-records-rls.mjs"]);
  },
};
