export default {
  name: "verify:daily-tasks-view-url-sync",
  run(ctx) {
    ctx.run("node", ["scripts/verify-daily-tasks-view-url-sync.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-daily-tasks-view-url-sync.mjs"]);
  },
};
