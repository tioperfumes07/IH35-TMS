export default {
  name: "verify:profit-loss-contract",
  run(ctx) {
    ctx.run("node", ["scripts/verify-profit-loss-contract.mjs"]);
  },
};
