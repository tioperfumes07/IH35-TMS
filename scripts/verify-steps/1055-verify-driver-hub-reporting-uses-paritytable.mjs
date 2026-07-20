export default {
  name: "verify:driver-hub-reporting-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-hub-reporting-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-driver-hub-reporting-uses-paritytable.mjs"]);
  },
};
