export default {
  name: "verify:fuel-load-attribution-failure-truth",
  run(ctx) {
    ctx.run("node", ["scripts/verify-fuel-load-attribution-failure-truth.mjs"]);
  },
};
