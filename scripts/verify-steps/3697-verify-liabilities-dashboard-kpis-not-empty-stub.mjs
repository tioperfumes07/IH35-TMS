export default {
  name: "verify:liabilities-dashboard-kpis-not-empty-stub",
  run(ctx) {
    ctx.run("node", ["scripts/verify-liabilities-dashboard-kpis-not-empty-stub.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-liabilities-dashboard-kpis-not-empty-stub.mjs"]);
  },
};
