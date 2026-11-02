export default {
  name: "verify:no-fixture-users-prod-guard",
  run(ctx) {
    ctx.run("node", ["scripts/verify-no-fixture-users-prod-guard.mjs"]);
  },
};
