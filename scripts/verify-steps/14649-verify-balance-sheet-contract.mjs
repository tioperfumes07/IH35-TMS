export default {
  name: "verify:balance-sheet-contract",
  run(ctx) {
    ctx.run("node", ["scripts/verify-balance-sheet-contract.mjs"]);
  },
};
