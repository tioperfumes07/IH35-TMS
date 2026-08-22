export default {
  name: "verify:parts-invoice-links-void-not-delete",
  run(ctx) {
    ctx.run("node", ["scripts/verify-parts-invoice-links-void-not-delete.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-parts-invoice-links-void-not-delete.mjs"]);
  },
};
