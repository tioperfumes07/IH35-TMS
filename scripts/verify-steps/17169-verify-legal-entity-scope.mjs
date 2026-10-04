export default {
  name: "verify:legal-entity-scope",
  run(ctx) {
    ctx.run("node", ["scripts/verify-legal-entity-scope.mjs"]);
  },
};
