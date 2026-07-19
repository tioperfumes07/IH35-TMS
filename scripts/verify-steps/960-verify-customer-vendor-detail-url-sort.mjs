export default {
  name: "verify:customer-vendor-detail-url-sort",
  run(ctx) {
    ctx.run("node", ["scripts/verify-customer-vendor-detail-url-sort.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-customer-vendor-detail-url-sort.mjs"]);
  },
};
