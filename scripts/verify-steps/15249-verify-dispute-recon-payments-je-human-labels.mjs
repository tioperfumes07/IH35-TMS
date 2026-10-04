export default {
  name: "verify:dispute-recon-payments-je-human-labels",
  run(ctx) {
    ctx.run("node", ["scripts/verify-dispute-recon-payments-je-human-labels.mjs"]);
  },
};
