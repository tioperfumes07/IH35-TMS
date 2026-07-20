export default {
  name: "verify:cash-flow-tabs-url-sync",
  run(ctx) {
    ctx.run("node", ["scripts/verify-cash-flow-tabs-url-sync.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-cash-flow-tabs-url-sync.mjs"]);
  },
};
