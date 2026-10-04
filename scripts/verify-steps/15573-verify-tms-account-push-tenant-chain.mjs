export default {
  name: "verify:tms-account-push-tenant-chain",
  run(ctx) {
    ctx.run("node", ["scripts/verify-tms-account-push-tenant-chain.mjs"]);
  },
};
