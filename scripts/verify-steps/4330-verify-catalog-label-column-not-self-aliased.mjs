export default {
  name: "verify:catalog-label-column-not-self-aliased",
  run(ctx) {
    ctx.run("node", ["scripts/verify-catalog-label-column-not-self-aliased.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-catalog-label-column-not-self-aliased.mjs"]);
  },
};
