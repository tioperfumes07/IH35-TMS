export default {
  name: "verify:fuel-transactions-genesis-anchor-documented",
  run(ctx) {
    ctx.run("node", ["scripts/verify-fuel-transactions-genesis-anchor-documented.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-fuel-transactions-genesis-anchor-documented.mjs"]);
  },
};
