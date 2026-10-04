export default {
  name: "verify:coa-resolver-entity-scope",
  run(ctx) {
    ctx.run("node", ["scripts/verify-coa-resolver-entity-scope.mjs"]);
  },
};
