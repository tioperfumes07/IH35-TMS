export default {
  name: "verify:receipts-scope-includes-vendor-invoice-category",
  run(ctx) {
    ctx.run("node", ["scripts/verify-receipts-scope-includes-vendor-invoice-category.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-receipts-scope-includes-vendor-invoice-category.mjs"]);
  },
};
