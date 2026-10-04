export default {
  name: "verify:driver-leave-review-cas",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-leave-review-cas.mjs"]);
  },
};
