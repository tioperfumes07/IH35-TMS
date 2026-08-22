export default {
  name: "verify:catalog-conflict-check-code-column-aliased",
  run(ctx) {
    ctx.run("node", ["scripts/verify-catalog-conflict-check-code-column-aliased.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-catalog-conflict-check-code-column-aliased.mjs"]);
  },
};
