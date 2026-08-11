export default {
  name: "verify:docs-entity-labels",
  run(ctx) {
    ctx.run("node", ["scripts/verify-docs-entity-labels.mjs"]);
  },
};
