export default {
  name: "verify:cash-advance-owner-notification-durable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-cash-advance-owner-notification-durable.mjs"]);
  },
};
