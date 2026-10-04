export default {
  name: "verify:fuel-loves-upload-invalid-row-truth",
  run(ctx) {
    ctx.run("node", ["scripts/verify-fuel-loves-upload-invalid-row-truth.mjs"]);
  },
};
