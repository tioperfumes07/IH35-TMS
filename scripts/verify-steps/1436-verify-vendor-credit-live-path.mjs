export default {
  name: "verify-vendor-credit-live-path",
  run(ctx) {
    ctx.run("node", ["scripts/verify-vendor-credit-live-path.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-vendor-credit-live-path.mjs"]);
  },
};
