export default {
  name: "verify-driver-vendor-no-uuid-fallback",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-driver-vendor-no-uuid-fallback.mjs", "--selftest"]) !== 0) return 1;
    if (ctx.run("node", ["scripts/verify-driver-vendor-no-uuid-fallback.mjs"]) !== 0) return 1;
    return 0;
  },
};
