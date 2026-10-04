export default {
  name: "verify:book-load-miles-required",
  run(ctx) {
    ctx.run("node", ["scripts/verify-book-load-miles-required.mjs"]);
  },
};
