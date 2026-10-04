export default {
  name: "verify:acct-f9408-cash-forecast-proforma-eta-bucket",
  run(ctx) {
    ctx.run("node", ["scripts/verify-acct-f9408-cash-forecast-proforma-eta-bucket.mjs"]);
  },
};
