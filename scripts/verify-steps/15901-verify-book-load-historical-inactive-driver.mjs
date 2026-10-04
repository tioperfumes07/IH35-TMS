export default {
  name: "verify:book-load-historical-inactive-driver",
  run(ctx) {
    ctx.run("node", ["scripts/verify-book-load-historical-inactive-driver.mjs"]);
  },
};
