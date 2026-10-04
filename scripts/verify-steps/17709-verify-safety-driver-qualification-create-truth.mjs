export default {
  name: "verify:safety-driver-qualification-create-truth",
  run(ctx) {
    ctx.run("node", ["scripts/verify-safety-driver-qualification-create-truth.mjs"]);
  },
};
