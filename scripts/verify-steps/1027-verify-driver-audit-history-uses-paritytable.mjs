export default {
  name: "verify:driver-audit-history-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-audit-history-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-driver-audit-history-uses-paritytable.mjs"]);
  },
};
