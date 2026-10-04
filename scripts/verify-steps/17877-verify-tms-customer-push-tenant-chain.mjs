export default {
  name: "verify:tms-customer-push-tenant-chain",
  run(ctx) {
    ctx.run("node", ["scripts/verify-tms-customer-push-tenant-chain.mjs"]);
  },
};
