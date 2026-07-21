export default {
  name: "verify:multi-entity-accounting-page-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-multi-entity-accounting-page-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-multi-entity-accounting-page-uses-paritytable.mjs"]);
  },
};
