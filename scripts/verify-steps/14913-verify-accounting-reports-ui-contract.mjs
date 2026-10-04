export default {
  name: "verify:accounting-reports-ui-contract",
  run(ctx) {
    ctx.run("node", ["scripts/verify-accounting-reports-ui-contract.mjs"]);
  },
};
