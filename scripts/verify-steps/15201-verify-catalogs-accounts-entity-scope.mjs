export default {
  name: "verify:catalogs-accounts-entity-scope",
  run(ctx) {
    ctx.run("node", ["scripts/verify-catalogs-accounts-entity-scope.mjs"]);
  },
};
