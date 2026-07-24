export default {
  name: "verify:acct-payment-deposit-entitylink",
  async run(ctx) {
    ctx.run("node", ["scripts/verify-acct-payment-deposit-entitylink.mjs"]);
  },
};
