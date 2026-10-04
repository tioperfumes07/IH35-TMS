export default {
  name: "verify:dispatch-load-aware-driver-complete-range",
  run(ctx) {
    ctx.run("node", ["scripts/verify-dispatch-load-aware-driver-complete-range.mjs"]);
  },
};
