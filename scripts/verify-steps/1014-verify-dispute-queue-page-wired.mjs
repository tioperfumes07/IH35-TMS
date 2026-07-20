// 0441-mod7-dispute-queue-stub — DisputeQueuePage must call real queue APIs.
export default {
  name: "dispute-queue-page-wired",
  run(ctx) {
    ctx.run("node", ["scripts/verify-dispute-queue-page-wired.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-dispute-queue-page-wired.mjs"]);
  },
};
