// LINK-F5186 — gl_je Required-column honesty audit, cluster 3 (banking/cash-flow/form_425/fuel/
// insurance/safety/settlements/factoring). (verify-step 3333 — CC-1 band, claimed in commit
// CLAIM-RESERVE verify-step 3333, landed on main as 3de7b886).
export default {
  name: "gl-je-required-honest-cluster3",
  run(ctx) {
    ctx.run("node", ["scripts/verify-gl-je-required-honest-cluster3.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-gl-je-required-honest-cluster3.mjs"]);
  },
};
