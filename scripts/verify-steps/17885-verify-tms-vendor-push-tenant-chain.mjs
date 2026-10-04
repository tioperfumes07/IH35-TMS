export default {
  name: "verify:tms-vendor-push-tenant-chain",
  run(ctx) {
    ctx.run("node", ["scripts/verify-tms-vendor-push-tenant-chain.mjs"]);
  },
};
