export default {
  name: "verify:mdata-write-entity-scope",
  run(ctx) {
    ctx.run("node", ["scripts/verify-mdata-write-entity-scope.mjs"]);
  },
};
