export default {
  name: "verify:feed-settlement-auto-mint",
  run(ctx) {
    ctx.run("node", ["scripts/verify-feed-settlement-auto-mint.mjs"]);
  },
};
