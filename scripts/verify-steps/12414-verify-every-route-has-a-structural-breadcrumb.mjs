export default {
  name: "verify:every-route-has-a-structural-breadcrumb",
  run(ctx) {
    ctx.run("node", ["scripts/verify-every-route-has-a-structural-breadcrumb.mjs"]);
    ctx.run("node", ["scripts/verify-back-arrow-stays-in-module.mjs"]);
    // ROUND 443.254 N2 — named guard; selftest plants cross-module back → FAIL.
    ctx.run("node", ["scripts/verify-back-returns-to-module-parent.mjs"]);
  },
};
