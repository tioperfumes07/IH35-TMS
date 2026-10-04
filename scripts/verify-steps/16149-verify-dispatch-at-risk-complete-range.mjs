export default {
  name: "verify:dispatch-at-risk-complete-range",
  run(ctx) {
    ctx.run("node", ["scripts/verify-dispatch-at-risk-complete-range.mjs"]);
  },
};
