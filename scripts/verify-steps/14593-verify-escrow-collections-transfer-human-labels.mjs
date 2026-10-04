export default {
  name: "verify:escrow-collections-transfer-human-labels",
  run(ctx) {
    ctx.run("node", ["scripts/verify-escrow-collections-transfer-human-labels.mjs"]);
  },
};
