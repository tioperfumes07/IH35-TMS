export default {
  name: "verify:driver-scheduler-review-record-lifecycle",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-scheduler-review-record-lifecycle.mjs"]);
  },
};
