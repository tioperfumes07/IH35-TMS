export default {
  name: "verify:fuel-posts-only-on-bank-match",
  run(ctx) {
    ctx.run("node", ["scripts/verify-fuel-posts-only-on-bank-match.mjs"]);
  },
};
