export default {
  name: "verify:one-feed-path-per-purchase",
  run(ctx) {
    ctx.run("node", ["scripts/verify-one-feed-path-per-purchase.mjs"]);
  },
};
