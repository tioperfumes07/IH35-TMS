export default {
  name: "verify:book-load-hard-block-response-not-silent",
  run(ctx) {
    ctx.run("node", ["scripts/verify-book-load-hard-block-response-not-silent.mjs"]);
  },
};
