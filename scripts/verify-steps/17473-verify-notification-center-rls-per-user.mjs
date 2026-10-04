export default {
  name: "verify:notification-center-rls-per-user",
  run(ctx) {
    ctx.run("node", ["scripts/verify-notification-center-rls-per-user.mjs"]);
  },
};
