export default {
  name: "verify:tms-item-push-tenant-chain",
  run(ctx) {
    ctx.run("node", ["scripts/verify-tms-item-push-tenant-chain.mjs"]);
  },
};
