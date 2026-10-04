export default {
  name: "verify:plaid-token-encrypted-at-rest",
  run(ctx) {
    ctx.run("node", ["scripts/verify-plaid-token-encrypted-at-rest.mjs"]);
  },
};
