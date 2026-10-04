export default {
  name: "verify:safety-driver-artifact-create-truth",
  run(ctx) {
    ctx.run("node", ["scripts/verify-safety-driver-artifact-create-truth.mjs"]);
  },
};
