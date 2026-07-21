export default {
  name: "verify:driver-detail-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-detail-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-driver-detail-uses-paritytable.mjs"]);
  },
};
