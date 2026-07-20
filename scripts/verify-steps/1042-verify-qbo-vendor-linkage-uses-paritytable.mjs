export default {
  name: "verify:qbo-vendor-linkage-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-qbo-vendor-linkage-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-qbo-vendor-linkage-uses-paritytable.mjs"]);
  },
};
