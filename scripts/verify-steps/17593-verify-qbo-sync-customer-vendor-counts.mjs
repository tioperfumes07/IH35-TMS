export default {
  name: "verify:qbo-sync-customer-vendor-counts",
  run(ctx) {
    ctx.run("node", ["scripts/verify-qbo-sync-customer-vendor-counts.mjs"]);
  },
};
