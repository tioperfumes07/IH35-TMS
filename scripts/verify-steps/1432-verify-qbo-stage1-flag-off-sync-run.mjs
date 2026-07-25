export default {
  name: "verify-qbo-stage1-flag-off-sync-run",
  run(ctx) {
    ctx.run("node", ["scripts/verify-qbo-stage1-flag-off-sync-run.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-qbo-stage1-flag-off-sync-run.mjs"]);
  },
};
