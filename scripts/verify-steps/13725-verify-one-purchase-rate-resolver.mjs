export default {
  name: "verify:one-purchase-rate-resolver",
  run(ctx) {
    ctx.run("node", ["scripts/verify-one-purchase-rate-resolver.mjs"]);
  },
};
