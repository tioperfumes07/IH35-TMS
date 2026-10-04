export default {
  name: "verify:audit-fix-10-mobile-status-bar-collapsed",
  run(ctx) {
    ctx.run("node", ["scripts/verify-audit-fix-10-mobile-status-bar-collapsed.mjs"]);
  },
};
