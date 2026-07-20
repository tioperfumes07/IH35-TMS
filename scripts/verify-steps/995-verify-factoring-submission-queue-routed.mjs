export default {
  name: "verify:factoring-submission-queue-routed",
  run(ctx) {
    ctx.run("node", ["scripts/verify-factoring-submission-queue-routed.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-factoring-submission-queue-routed.mjs"]);
  },
};
