export default {
  name: "verify:audit-fix-3-list-view-toggle-renders",
  run(ctx) {
    ctx.run("node", ["scripts/verify-audit-fix-3-list-view-toggle-renders.mjs"]);
  },
};
