export default {
  name: "verify:driver-safety-training-range",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-safety-training-range.mjs"]);
  },
};
