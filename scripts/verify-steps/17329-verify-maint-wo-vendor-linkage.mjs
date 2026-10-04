export default {
  name: "verify:maint-wo-vendor-linkage",
  run(ctx) {
    ctx.run("node", ["scripts/verify-maint-wo-vendor-linkage.mjs"]);
  },
};
