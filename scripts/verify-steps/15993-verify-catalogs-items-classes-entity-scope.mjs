export default {
  name: "verify:catalogs-items-classes-entity-scope",
  run(ctx) {
    ctx.run("node", ["scripts/verify-catalogs-items-classes-entity-scope.mjs"]);
  },
};
