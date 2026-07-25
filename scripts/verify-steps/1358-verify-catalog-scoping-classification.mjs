export default {
  name: "verify:catalog-scoping-classification",
  run(ctx) {
    ctx.run("node", ["scripts/verify-catalog-scoping-classification.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-catalog-scoping-classification.mjs"]);
  },
};
