export default {
  name: "verify:maintenance-labor-codes-complete-feed",
  run(ctx) {
    ctx.run("node", ["scripts/verify-maintenance-labor-codes-complete-feed.mjs"]);
  },
};
