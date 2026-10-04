export default {
  name: "verify:escrow-amount-conservation",
  run(ctx) {
    ctx.run("node", ["scripts/verify-escrow-amount-conservation.mjs"]);
  },
};
