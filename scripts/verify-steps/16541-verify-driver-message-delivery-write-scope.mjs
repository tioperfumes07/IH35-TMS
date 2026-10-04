export default {
  name: "verify:driver-message-delivery-write-scope",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-message-delivery-write-scope.mjs"]);
  },
};
