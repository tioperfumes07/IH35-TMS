export default {
  name: "verify:vehicle-compliance-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-vehicle-compliance-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-vehicle-compliance-uses-paritytable.mjs"]);
  },
};
