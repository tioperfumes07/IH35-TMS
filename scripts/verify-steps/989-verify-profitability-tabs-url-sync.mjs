export default {
  name: "verify:profitability-tabs-url-sync",
  run(ctx) {
    ctx.run("node", ["scripts/verify-profitability-tabs-url-sync.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-profitability-tabs-url-sync.mjs"]);
  },
};
