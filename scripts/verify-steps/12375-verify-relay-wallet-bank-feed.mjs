export default {
  name: "verify:relay-wallet-bank-feed",
  run(ctx) {
    ctx.run("node", ["scripts/verify-relay-wallet-bank-feed.mjs"]);
  },
};
