export default {
  name: "verify:list-defaults-and-kpi-shape",
  run(ctx) {
    ctx.run("node", ["scripts/verify-list-defaults-and-kpi-shape.mjs"]);
    ctx.run("node", ["scripts/verify-banking-home-kpi-owner-now.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-banking-home-kpi-owner-now.mjs"]);
    ctx.run("node", ["scripts/verify-money-cells-click-through.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-money-cells-click-through.mjs"]);
    ctx.run("node", ["scripts/verify-reclassify-account-stays-highlighted.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-reclassify-account-stays-highlighted.mjs"]);
  },
};
