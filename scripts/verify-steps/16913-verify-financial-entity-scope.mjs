export default {
  name: "verify:financial-entity-scope",
  run(ctx) {
    ctx.run("node", ["scripts/verify-financial-entity-scope.mjs"]);
  },
};
