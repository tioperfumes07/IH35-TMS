export default {
  name: "verify:active-dispatch-load-complete-range",
  run(ctx) {
    ctx.run("node", ["scripts/verify-active-dispatch-load-complete-range.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-active-dispatch-load-complete-range.mjs"]);
  },
};
