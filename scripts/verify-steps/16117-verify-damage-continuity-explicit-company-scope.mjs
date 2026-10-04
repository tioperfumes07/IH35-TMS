export default {
  name: "verify:damage-continuity-explicit-company-scope",
  run(ctx) {
    ctx.run("node", ["scripts/verify-damage-continuity-explicit-company-scope.mjs"]);
  },
};
