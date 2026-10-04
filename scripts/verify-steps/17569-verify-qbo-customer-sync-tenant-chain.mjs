export default {
  name: "verify:qbo-customer-sync-tenant-chain",
  run(ctx) {
    ctx.run("node", ["scripts/verify-qbo-customer-sync-tenant-chain.mjs"]);
  },
};
