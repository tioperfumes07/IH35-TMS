export default {
  name: "verify:drivers-reference-catalog-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-drivers-reference-catalog-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-drivers-reference-catalog-uses-paritytable.mjs"]);
  },
};
