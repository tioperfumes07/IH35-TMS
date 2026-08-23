export default {
  name: "verify:users-change-role-current-role-label",
  run(ctx) {
    ctx.run("node", ["scripts/verify-users-change-role-current-role-label.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-users-change-role-current-role-label.mjs"]);
  },
};
