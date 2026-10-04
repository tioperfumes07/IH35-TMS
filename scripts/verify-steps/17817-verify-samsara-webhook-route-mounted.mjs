export default {
  name: "verify:samsara-webhook-route-mounted",
  run(ctx) {
    ctx.run("node", ["scripts/verify-samsara-webhook-route-mounted.mjs"]);
  },
};
