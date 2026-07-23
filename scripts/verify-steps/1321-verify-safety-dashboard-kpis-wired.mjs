export default {
  name: "verify:safety-dashboard-kpis-wired",
  run(ctx) {
    ctx.run("node", ["scripts/verify-safety-dashboard-kpis-wired.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-safety-dashboard-kpis-wired.mjs"]);
  },
};
