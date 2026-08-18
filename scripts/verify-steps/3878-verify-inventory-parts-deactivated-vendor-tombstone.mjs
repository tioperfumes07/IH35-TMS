export default {
  name: "verify:inventory-parts-deactivated-vendor-tombstone",
  async run(ctx) {
    ctx.run("node", ["scripts/verify-inventory-parts-deactivated-vendor-tombstone.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-inventory-parts-deactivated-vendor-tombstone.mjs"]);
  },
};
