export default {
  name: "verify:trial-balance-contract",
  run(ctx) {
    ctx.run("node", ["scripts/verify-trial-balance-contract.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-trial-balance-contract.mjs"]);
  },
};
