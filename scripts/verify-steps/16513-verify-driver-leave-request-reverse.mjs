export default {
  name: "verify:driver-leave-request-reverse",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-leave-request-reverse.mjs"]);
  },
};
