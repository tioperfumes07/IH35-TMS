export default {
  name: "verify:bank-feed-category-seed",
  run(ctx) {
    ctx.run("node", ["scripts/verify-bank-feed-category-seed.mjs"]);
  },
};
