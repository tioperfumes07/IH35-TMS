export default {
  name: "verify:safety-leave-request-route-identity",
  run(ctx) {
    ctx.run("node", ["scripts/verify-safety-leave-request-route-identity.mjs"]);
  },
};
