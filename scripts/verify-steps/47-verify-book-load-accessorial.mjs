export default {
  name: "verify-book-load-accessorial",
  run(ctx) {
    if (ctx.run("npm", ["run", "verify:book-load-accessorial"]) !== 0) {
      return 1;
    }
    return 0;
  },
};
