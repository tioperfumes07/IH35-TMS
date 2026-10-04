export default {
  name: "verify:void-reversal-keeps-line-source",
  run(ctx) {
    ctx.run("node", ["scripts/verify-void-reversal-keeps-line-source.mjs"]);
  },
};
