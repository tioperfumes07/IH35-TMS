export default {
  name: "verify:safety-void-actions-visible-errors",
  run(ctx) {
    ctx.run("node", ["scripts/verify-safety-void-actions-visible-errors.mjs"]);
  },
};
