export default {
  name: "verify:safety-csa-score-error-state",
  run(ctx) {
    ctx.run("node", ["scripts/verify-safety-csa-score-error-state.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-safety-csa-score-error-state.mjs"]);
  },
};
