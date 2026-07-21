export default {
  name: "verify:unit-parts-history-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-unit-parts-history-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-unit-parts-history-uses-paritytable.mjs"]);
  },
};
