export default {
  name: "verify:driver-escrow-tab-content-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-escrow-tab-content-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-driver-escrow-tab-content-uses-paritytable.mjs"]);
  },
};
