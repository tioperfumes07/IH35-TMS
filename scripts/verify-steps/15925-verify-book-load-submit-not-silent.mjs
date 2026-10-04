export default {
  name: "verify:book-load-submit-not-silent",
  run(ctx) {
    ctx.run("node", ["scripts/verify-book-load-submit-not-silent.mjs"]);
  },
};
