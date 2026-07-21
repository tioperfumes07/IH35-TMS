export default {
  name: "verify:driver-catalog-list-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-catalog-list-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-driver-catalog-list-uses-paritytable.mjs"]);
  },
};
