export default {
  name: "verify:book-load-post-insert-updates-checked",
  run(ctx) {
    ctx.run("node", ["scripts/verify-book-load-post-insert-updates-checked.mjs"]);
  },
};
