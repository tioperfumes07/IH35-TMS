export default {
  name: "verify:no-reader-of-stop-arrivals",
  run(ctx) {
    ctx.run("node", ["scripts/verify-no-reader-of-stop-arrivals.mjs"]);
  },
};
