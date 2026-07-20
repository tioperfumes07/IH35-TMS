export default {
  name: "verify:qbo-reconcile-tabs-url-sync",
  run(ctx) {
    ctx.run("node", ["scripts/verify-qbo-reconcile-tabs-url-sync.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-qbo-reconcile-tabs-url-sync.mjs"]);
  },
};
