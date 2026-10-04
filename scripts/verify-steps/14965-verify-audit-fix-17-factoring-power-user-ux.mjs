export default {
  name: "verify:audit-fix-17-factoring-power-user-ux",
  run(ctx) {
    ctx.run("node", ["scripts/verify-audit-fix-17-factoring-power-user-ux.mjs"]);
  },
};
