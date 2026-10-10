export default {
  name: "verify:book-load-on-client-caller-transaction",
  run(ctx) {
    ctx.run("node", ["scripts/verify-book-load-on-client-caller-transaction.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-book-load-on-client-caller-transaction.mjs"]);
  },
};
