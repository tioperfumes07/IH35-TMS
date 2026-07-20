export default {
  name: "verify:docs-home-page-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-docs-home-page-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-docs-home-page-uses-paritytable.mjs"]);
  },
};
