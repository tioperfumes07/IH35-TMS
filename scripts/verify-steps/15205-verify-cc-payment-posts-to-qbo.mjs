export default {
  name: "verify:cc-payment-posts-to-qbo",
  run(ctx) {
    ctx.run("node", ["scripts/verify-cc-payment-posts-to-qbo.mjs"]);
  },
};
