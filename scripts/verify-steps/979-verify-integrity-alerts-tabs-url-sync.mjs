export default {
  name: "verify:integrity-alerts-tabs-url-sync",
  run(ctx) {
    ctx.run("node", ["scripts/verify-integrity-alerts-tabs-url-sync.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-integrity-alerts-tabs-url-sync.mjs"]);
  },
};
