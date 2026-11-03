export default {
  name: "verify:cash-flow-avp-expense-engine-parity",
  run(ctx) {
    ctx.run("node", ["scripts/verify-cash-flow-avp-expense-engine-parity.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-cash-flow-avp-expense-engine-parity.mjs"]);
  },
};
