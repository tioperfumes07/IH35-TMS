export default {
  name: "verify:maint-labor-vendor-company-link",
  run(ctx) {
    ctx.run("node", ["scripts/verify-maint-labor-vendor-company-link.mjs"]);
  },
};
