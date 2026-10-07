export default {
  name: "verify:settlement-creator-books-with-po-and-real-stop-state",
  run(ctx) {
    ctx.run("node", ["scripts/verify-settlement-creator-books-with-po-and-real-stop-state.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-settlement-creator-books-with-po-and-real-stop-state.mjs"]);
  },
};
