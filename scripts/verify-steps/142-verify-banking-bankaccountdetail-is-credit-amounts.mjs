export default {
  name: "verify-banking-bankaccountdetail-is-credit-amounts",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-banking-bankaccountdetail-is-credit-amounts.mjs"]) !== 0) {
      return 1;
    }
    return 0;
  },
};
