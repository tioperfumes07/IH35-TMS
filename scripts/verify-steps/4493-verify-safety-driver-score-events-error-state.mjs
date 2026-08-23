export default {
  name: "verify:safety-driver-score-events-error-state",
  run(ctx) {
    ctx.run("node", ["scripts/verify-safety-driver-score-events-error-state.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-safety-driver-score-events-error-state.mjs"]);
  },
};
