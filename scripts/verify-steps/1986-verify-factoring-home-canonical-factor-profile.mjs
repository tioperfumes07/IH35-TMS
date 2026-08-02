export default {
  name: "verify:factoring-home-canonical-factor-profile",
  run(ctx) {
    ctx.run("node", ["scripts/verify-factoring-home-canonical-factor-profile.mjs"]);
  },
};
