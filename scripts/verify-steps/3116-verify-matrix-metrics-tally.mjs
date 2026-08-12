export default {
  name: "verify-matrix-metrics-tally",
  run(ctx) {
    ctx.run("node", ["scripts/verify-matrix-metrics-tally.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-matrix-metrics-tally.mjs"]);
  },
};
