export default {
  name: "verify:driver-layover-history-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-layover-history-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-driver-layover-history-uses-paritytable.mjs"]);
  },
};
