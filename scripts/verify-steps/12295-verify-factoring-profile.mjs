export default {
  name: "verify:factoring-profile",
  run(ctx) {
    ctx.run("node", ["scripts/verify-factoring-profile.mjs"]);
  },
};
