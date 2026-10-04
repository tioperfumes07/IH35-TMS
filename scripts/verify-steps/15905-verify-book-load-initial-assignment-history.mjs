export default {
  name: "verify:book-load-initial-assignment-history",
  run(ctx) {
    ctx.run("node", ["scripts/verify-book-load-initial-assignment-history.mjs"]);
  },
};
