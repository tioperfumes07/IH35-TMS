export default {
  name: "verify:for-review-has-no-document",
  run(ctx) {
    ctx.run("node", ["scripts/verify-for-review-has-no-document.mjs"]);
  },
};
