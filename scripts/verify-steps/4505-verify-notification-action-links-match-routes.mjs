export default {
  name: "verify:notification-action-links-match-routes",
  run(ctx) {
    ctx.run("node", ["scripts/verify-notification-action-links-match-routes.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-notification-action-links-match-routes.mjs"]);
  },
};
