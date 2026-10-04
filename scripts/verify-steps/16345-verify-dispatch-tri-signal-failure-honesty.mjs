export default {
  name: "verify:dispatch-tri-signal-failure-honesty",
  run(ctx) {
    ctx.run("node", ["scripts/verify-dispatch-tri-signal-failure-honesty.mjs"]);
  },
};
