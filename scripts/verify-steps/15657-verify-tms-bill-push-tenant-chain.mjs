export default {
  name: "verify:tms-bill-push-tenant-chain",
  run(ctx) {
    ctx.run("node", ["scripts/verify-tms-bill-push-tenant-chain.mjs"]);
  },
};
