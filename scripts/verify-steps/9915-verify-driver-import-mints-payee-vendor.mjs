export default {
  name: "verify:driver-import-mints-payee-vendor",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-import-mints-payee-vendor.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-driver-import-mints-payee-vendor.mjs"]);
  },
};
