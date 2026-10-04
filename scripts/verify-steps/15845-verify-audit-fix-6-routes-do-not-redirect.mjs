export default {
  name: "verify:audit-fix-6-routes-do-not-redirect",
  run(ctx) {
    ctx.run("node", ["scripts/verify-audit-fix-6-routes-do-not-redirect.mjs"]);
  },
};
