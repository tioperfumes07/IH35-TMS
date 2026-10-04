export default {
  name: "verify:driver-clear-default-truck-failure-truth",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-clear-default-truck-failure-truth.mjs"]);
  },
};
