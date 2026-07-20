export default {
  name: "verify:qbo-vendor-linkage-tabs-url-sync",
  run(ctx) {
    ctx.run("node", ["scripts/verify-qbo-vendor-linkage-tabs-url-sync.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-qbo-vendor-linkage-tabs-url-sync.mjs"]);
  },
};
