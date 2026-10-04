export default {
  name: "verify:dispatch-timeline-leave-failure-honesty",
  run(ctx) {
    ctx.run("node", ["scripts/verify-dispatch-timeline-leave-failure-honesty.mjs"]);
  },
};
