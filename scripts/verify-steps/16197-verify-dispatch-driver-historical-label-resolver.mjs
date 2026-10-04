export default {
  name: "verify:dispatch-driver-historical-label-resolver",
  run(ctx) {
    ctx.run("node", ["scripts/verify-dispatch-driver-historical-label-resolver.mjs"]);
  },
};
