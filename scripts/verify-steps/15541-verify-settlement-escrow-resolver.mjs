export default {
  name: "verify:settlement-escrow-resolver",
  run(ctx) {
    ctx.run("node", ["scripts/verify-settlement-escrow-resolver.mjs"]);
  },
};
