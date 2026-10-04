export default {
  name: "verify:dispatch-flag-picker-failure-honesty",
  run(ctx) {
    ctx.run("node", ["scripts/verify-dispatch-flag-picker-failure-honesty.mjs"]);
  },
};
