export default {
  name: "verify:samsara-fuel-push-never-substitutes",
  run(ctx) {
    ctx.run("node", ["scripts/verify-samsara-fuel-push-never-substitutes.mjs"]);
  },
};
