export default {
  name: "verify:book-stop-city-required",
  run(ctx) {
    ctx.run("node", ["scripts/verify-book-stop-city-required.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-book-stop-city-required.mjs"]);
  },
};
