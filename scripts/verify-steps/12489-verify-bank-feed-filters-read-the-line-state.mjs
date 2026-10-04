export default {
  name: "verify:bank-feed-filters-read-the-line-state",
  run(ctx) {
    ctx.run("node", ["scripts/verify-bank-feed-filters-read-the-line-state.mjs"]);
  },
};
