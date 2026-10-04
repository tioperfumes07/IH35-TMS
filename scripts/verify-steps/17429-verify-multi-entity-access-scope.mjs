export default {
  name: "verify:multi-entity-access-scope",
  run(ctx) {
    ctx.run("node", ["scripts/verify-multi-entity-access-scope.mjs"]);
  },
};
