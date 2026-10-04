export default {
  name: "verify:book-load-validation-summary-honest",
  run(ctx) {
    ctx.run("node", ["scripts/verify-book-load-validation-summary-honest.mjs"]);
  },
};
