export default {
  name: "verify:book-load-stop-validation-honesty",
  run(ctx) {
    ctx.run("node", ["scripts/verify-book-load-stop-validation-honesty.mjs"]);
  },
};
