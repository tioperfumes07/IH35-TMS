export default {
  name: "verify:fuel-card-overage-confirm-modal",
  run(ctx) {
    ctx.run("node", ["scripts/verify-fuel-card-overage-confirm-modal.mjs"]);
  },
};
