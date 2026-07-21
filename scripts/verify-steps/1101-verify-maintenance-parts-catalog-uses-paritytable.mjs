export default {
  name: "verify:maintenance-parts-catalog-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-maintenance-parts-catalog-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-maintenance-parts-catalog-uses-paritytable.mjs"]);
  },
};
