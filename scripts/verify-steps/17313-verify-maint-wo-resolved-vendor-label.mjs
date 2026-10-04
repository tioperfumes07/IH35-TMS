export default {
  name: "verify:maint-wo-resolved-vendor-label",
  run(ctx) {
    ctx.run("node", ["scripts/verify-maint-wo-resolved-vendor-label.mjs"]);
  },
};
