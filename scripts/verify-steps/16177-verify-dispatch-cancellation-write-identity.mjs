export default {
  name: "verify:dispatch-cancellation-write-identity",
  run(ctx) {
    ctx.run("node", ["scripts/verify-dispatch-cancellation-write-identity.mjs"]);
  },
};
