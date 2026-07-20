export default {
  name: "verify:portal-dashboard-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-portal-dashboard-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-portal-dashboard-uses-paritytable.mjs"]);
  },
};
