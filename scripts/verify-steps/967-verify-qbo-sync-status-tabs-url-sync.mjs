export default {
  name: "verify:qbo-sync-status-tabs-url-sync",
  run(ctx) {
    ctx.run("node", ["scripts/verify-qbo-sync-status-tabs-url-sync.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-qbo-sync-status-tabs-url-sync.mjs"]);
  },
};
