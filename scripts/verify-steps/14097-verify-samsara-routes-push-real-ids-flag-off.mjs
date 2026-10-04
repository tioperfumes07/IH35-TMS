export default {
  name: "verify:samsara-routes-push-real-ids-flag-off",
  run(ctx) {
    ctx.run("node", ["scripts/verify-samsara-routes-push-real-ids-flag-off.mjs"]);
  },
};
