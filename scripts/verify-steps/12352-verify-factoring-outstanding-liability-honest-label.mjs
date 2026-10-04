export default {
  name: "verify:factoring-outstanding-liability-honest-label",
  run(ctx) {
    ctx.run("node", ["scripts/verify-factoring-outstanding-liability-honest-label.mjs"]);
    ctx.run("node", ["scripts/verify-every-balance-surface-declares-cleared-and-uncleared.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-every-balance-surface-declares-cleared-and-uncleared.mjs"]);
  },
};
