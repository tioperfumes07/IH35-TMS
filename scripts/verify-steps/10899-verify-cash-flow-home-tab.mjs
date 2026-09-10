export default {
  name: "verify:cash-flow-home-tab",
  run(ctx) {
    ctx.run("node", ["scripts/verify-cash-flow-home-tab.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-cash-flow-home-tab.mjs"]);
  },
};
