export default {
  name: "verify:relay-fuel-webhook-receiver",
  run(ctx) {
    ctx.run("node", ["scripts/verify-relay-fuel-webhook-receiver.mjs"]);
  },
};
