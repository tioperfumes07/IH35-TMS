export default {
  name: "verify:integrity-review-company-lifecycle",
  run(ctx) {
    ctx.run("node", ["scripts/verify-integrity-review-company-lifecycle.mjs"]);
  },
};
