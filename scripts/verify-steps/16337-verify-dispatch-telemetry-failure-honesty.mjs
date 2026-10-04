export default {
  name: "verify:dispatch-telemetry-failure-honesty",
  run(ctx) {
    ctx.run("node", ["scripts/verify-dispatch-telemetry-failure-honesty.mjs"]);
  },
};
