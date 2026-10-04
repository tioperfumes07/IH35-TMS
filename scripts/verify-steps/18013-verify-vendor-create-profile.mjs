export default {
  name: "verify:vendor-create-profile",
  run(ctx) {
    ctx.run("node", ["scripts/verify-vendor-create-profile.mjs"]);
  },
};
