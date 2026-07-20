export default {
  name: "verify:fuel-reconciliation-tabs-url-sync",
  run(ctx) {
    ctx.run("node", ["scripts/verify-fuel-reconciliation-tabs-url-sync.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-fuel-reconciliation-tabs-url-sync.mjs"]);
  },
};
