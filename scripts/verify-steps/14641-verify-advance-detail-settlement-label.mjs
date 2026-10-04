export default {
  name: "verify:advance-detail-settlement-label",
  run(ctx) {
    ctx.run("node", ["scripts/verify-advance-detail-settlement-label.mjs"]);
  },
};
