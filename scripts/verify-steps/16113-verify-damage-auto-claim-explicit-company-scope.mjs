export default {
  name: "verify:damage-auto-claim-explicit-company-scope",
  run(ctx) {
    ctx.run("node", ["scripts/verify-damage-auto-claim-explicit-company-scope.mjs"]);
  },
};
