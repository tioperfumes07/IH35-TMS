// LINK-F5186 — gl_je Required-column honesty audit, cluster 2 (reports/maintenance/finance/system).
// (verify-step 3345 — CC-1 band, claimed in commit CLAIM-RESERVE verify-step 3345, landed on main
// as 57119830).
export default {
  name: "gl-je-required-honest-cluster2",
  run(ctx) {
    ctx.run("node", ["scripts/verify-gl-je-required-honest-cluster2.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-gl-je-required-honest-cluster2.mjs"]);
  },
};
