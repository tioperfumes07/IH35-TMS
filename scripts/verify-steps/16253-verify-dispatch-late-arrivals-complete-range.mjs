export default {
  name: "verify:dispatch-late-arrivals-complete-range",
  run(ctx) {
    ctx.run("node", ["scripts/verify-dispatch-late-arrivals-complete-range.mjs"]);
  },
};
