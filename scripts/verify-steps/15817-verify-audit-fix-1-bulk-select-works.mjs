export default {
  name: "verify:audit-fix-1-bulk-select-works",
  run(ctx) {
    ctx.run("node", ["scripts/verify-audit-fix-1-bulk-select-works.mjs"]);
  },
};
