export default {
  name: "verify:bank-line-posts-in-same-transaction",
  run(ctx) {
    ctx.run("node", ["scripts/verify-bank-line-posts-in-same-transaction.mjs"]);
  },
};
