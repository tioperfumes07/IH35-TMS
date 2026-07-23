export default {
  name: "verify:vendor-credits-ui-linkage",
  run(ctx) {
    ctx.run("node", ["scripts/verify-vendor-credits-ui-linkage.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-vendor-credits-ui-linkage.mjs"]);
  },
};
