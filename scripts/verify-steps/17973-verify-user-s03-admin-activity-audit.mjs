export default {
  name: "verify:user-s03-admin-activity-audit",
  run(ctx) {
    ctx.run("node", ["scripts/verify-user-s03-admin-activity-audit.mjs"]);
  },
};
