export default {
  name: "verify:type-catalog-admin-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-type-catalog-admin-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-type-catalog-admin-uses-paritytable.mjs"]);
  },
};
