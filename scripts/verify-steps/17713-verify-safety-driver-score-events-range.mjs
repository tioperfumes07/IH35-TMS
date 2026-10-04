export default {
  name: "verify:safety-driver-score-events-range",
  run(ctx) {
    ctx.run("node", ["scripts/verify-safety-driver-score-events-range.mjs"]);
  },
};
