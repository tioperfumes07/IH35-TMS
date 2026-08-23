export default {
  name: "verify:cash-flow-overview-avg-flow-sign",
  run(ctx) {
    ctx.run("node", ["scripts/verify-cash-flow-overview-avg-flow-sign.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-cash-flow-overview-avg-flow-sign.mjs"]);
  },
};
