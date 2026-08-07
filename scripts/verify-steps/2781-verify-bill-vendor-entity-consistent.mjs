export default {
  name: "verify-bill-vendor-entity-consistent",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-bill-vendor-entity-consistent.mjs", "--selftest"]) !== 0) return 1;
    if (ctx.run("node", ["scripts/verify-bill-vendor-entity-consistent.mjs"]) !== 0) return 1;
    return 0;
  },
};
