export default {
  name: "verify:driver-message-delivery-handler-scope",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-message-delivery-handler-scope.mjs"]);
  },
};
