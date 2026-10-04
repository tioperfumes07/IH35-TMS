export default {
  name: "verify:faro-cash-reserve-presents-as-payable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-faro-cash-reserve-presents-as-payable.mjs"]);
  },
};
