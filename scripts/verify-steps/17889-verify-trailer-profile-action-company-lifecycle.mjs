export default {
  name: "verify:trailer-profile-action-company-lifecycle",
  run(ctx) {
    ctx.run("node", ["scripts/verify-trailer-profile-action-company-lifecycle.mjs"]);
  },
};
