export default {
  name: "verify:audit-fix-13-customers-pagination-works",
  run(ctx) {
    ctx.run("node", ["scripts/verify-audit-fix-13-customers-pagination-works.mjs"]);
  },
};
