export default {
  name: "verify:driver-create-mints-vendor",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-create-mints-vendor.mjs"]);
  },
};
