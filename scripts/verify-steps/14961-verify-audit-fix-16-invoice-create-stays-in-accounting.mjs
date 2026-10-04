export default {
  name: "verify:audit-fix-16-invoice-create-stays-in-accounting",
  run(ctx) {
    ctx.run("node", ["scripts/verify-audit-fix-16-invoice-create-stays-in-accounting.mjs"]);
  },
};
