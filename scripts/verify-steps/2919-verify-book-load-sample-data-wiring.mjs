export default {
  name: "verify:book-load-sample-data-wiring",
  run(ctx) {
    ctx.run("node", ["scripts/verify-book-load-sample-data-wiring.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-book-load-sample-data-wiring.mjs"]);
  },
};
