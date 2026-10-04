export default {
  name: "verify:maint-parts-invoice-link-company-audits",
  run(ctx) {
    ctx.run("node", ["scripts/verify-maint-parts-invoice-link-company-audits.mjs"]);
  },
};
