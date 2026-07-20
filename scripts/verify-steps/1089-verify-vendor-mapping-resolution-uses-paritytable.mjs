export default {
  name: "verify:vendor-mapping-resolution-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-vendor-mapping-resolution-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-vendor-mapping-resolution-uses-paritytable.mjs"]);
  },
};
