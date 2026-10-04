export default {
  name: "verify:tms-invoice-push-tenant-chain",
  run(ctx) {
    ctx.run("node", ["scripts/verify-tms-invoice-push-tenant-chain.mjs"]);
  },
};
