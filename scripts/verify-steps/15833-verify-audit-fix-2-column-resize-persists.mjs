export default {
  name: "verify:audit-fix-2-column-resize-persists",
  run(ctx) {
    ctx.run("node", ["scripts/verify-audit-fix-2-column-resize-persists.mjs"]);
  },
};
