export default {
  name: "verify:oem-parts-catalog-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-oem-parts-catalog-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-oem-parts-catalog-uses-paritytable.mjs"]);
  },
};
