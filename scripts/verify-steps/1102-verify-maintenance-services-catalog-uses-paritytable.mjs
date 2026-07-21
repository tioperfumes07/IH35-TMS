export default {
  name: "verify:maintenance-services-catalog-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-maintenance-services-catalog-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-maintenance-services-catalog-uses-paritytable.mjs"]);
  },
};
