export default {
  name: "verify:bill-detail-vendor-unit-links",
  run(ctx) {
    ctx.run("node", ["scripts/verify-bill-detail-vendor-unit-links.mjs"]);
  },
};
