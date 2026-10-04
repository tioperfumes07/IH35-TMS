export default {
  name: "verify:accounting-periods-contract",
  run(ctx) {
    ctx.run("node", ["scripts/verify-accounting-periods-contract.mjs"]);
  },
};
