export default {
  name: "verify:book-load-single-submit",
  run(ctx) {
    ctx.run("node", ["scripts/verify-book-load-single-submit.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-book-load-single-submit.mjs"]);
  },
};
