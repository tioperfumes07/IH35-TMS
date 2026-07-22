export default {
  name: "verify:home-kpi-range-toggle",
  run(ctx) {
    ctx.run("node", ["scripts/verify-home-kpi-range-toggle.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-home-kpi-range-toggle.mjs"]);
  },
};
