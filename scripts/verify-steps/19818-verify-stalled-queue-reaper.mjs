export default {
  name: "verify:stalled-queue-reaper",
  run(ctx) {
    ctx.run("node", ["scripts/verify-stalled-queue-reaper.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-stalled-queue-reaper.mjs"]);
  },
};
