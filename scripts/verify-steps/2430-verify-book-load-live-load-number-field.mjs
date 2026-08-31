export default {
  name: "verify-book-load-live-load-number-field",
  run(ctx) {
    return ctx.run("node", ["scripts/verify-book-load-live-load-number-field.mjs"]);
  },
};
