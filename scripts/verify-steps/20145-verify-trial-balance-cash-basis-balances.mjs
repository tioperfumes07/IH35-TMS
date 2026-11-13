export default {
  name: "verify:trial-balance-cash-basis-balances",
  run(ctx) {
    ctx.run("node", ["scripts/verify-trial-balance-cash-basis-balances.mjs"]);
    ctx.run("node", ["scripts/verify-trial-balance-cash-basis-balances.mjs", "--selftest"]);
  },
};
