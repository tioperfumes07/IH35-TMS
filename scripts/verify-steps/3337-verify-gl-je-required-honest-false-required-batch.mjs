// LINK-F5186 — gl_je Required-column honesty audit, false-required batch (accounting/reports/
// finance/system). (verify-step 3337 — CC-1 band, claimed in commit CLAIM-RESERVE verify-step
// 3337, landed on main as b0ed311e).
export default {
  name: "gl-je-required-honest-false-required-batch",
  run(ctx) {
    ctx.run("node", ["scripts/verify-gl-je-required-honest-false-required-batch.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-gl-je-required-honest-false-required-batch.mjs"]);
  },
};
