export default {
  name: "verify:payment-application-tenant-chain",
  run(ctx) {
    ctx.run("node", ["scripts/verify-payment-application-tenant-chain.mjs"]);
  },
};
