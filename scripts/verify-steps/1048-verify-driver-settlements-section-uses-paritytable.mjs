export default {
  name: "verify:driver-settlements-section-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-settlements-section-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-driver-settlements-section-uses-paritytable.mjs"]);
  },
};
