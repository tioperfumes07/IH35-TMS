export default {
  name: "verify:cash-flow-contract",
  run(ctx) {
    ctx.run("node", ["scripts/verify-cash-flow-contract.mjs"]);
  },
};
