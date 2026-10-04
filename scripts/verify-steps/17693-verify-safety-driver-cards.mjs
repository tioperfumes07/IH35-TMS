export default {
  name: "verify:safety-driver-cards",
  run(ctx) {
    ctx.run("node", ["scripts/verify-safety-driver-cards.mjs"]);
  },
};
