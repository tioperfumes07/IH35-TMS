export default {
  name: "verify:user-s04-onboarding-entity-scope",
  run(ctx) {
    ctx.run("node", ["scripts/verify-user-s04-onboarding-entity-scope.mjs"]);
  },
};
