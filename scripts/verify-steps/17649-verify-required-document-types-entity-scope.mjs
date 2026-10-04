export default {
  name: "verify:required-document-types-entity-scope",
  run(ctx) {
    ctx.run("node", ["scripts/verify-required-document-types-entity-scope.mjs"]);
  },
};
