export default {
  name: "verify:faro-purchase-day-feed-law",
  run(ctx) {
    ctx.run("node", ["scripts/verify-faro-purchase-day-feed-law.mjs"]);
  },
};
