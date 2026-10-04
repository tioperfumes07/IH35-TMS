export default {
  name: "verify:identity-users-last-login-at-column",
  run(ctx) {
    ctx.run("node", ["scripts/verify-identity-users-last-login-at-column.mjs"]);
  },
};
