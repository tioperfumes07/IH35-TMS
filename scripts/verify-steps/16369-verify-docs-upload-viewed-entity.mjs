export default {
  name: "verify:docs-upload-viewed-entity",
  run(ctx) {
    ctx.run("node", ["scripts/verify-docs-upload-viewed-entity.mjs"]);
  },
};
