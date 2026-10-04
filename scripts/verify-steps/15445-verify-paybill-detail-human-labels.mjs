export default {
  name: "verify:paybill-detail-human-labels",
  run(ctx) {
    ctx.run("node", ["scripts/verify-paybill-detail-human-labels.mjs"]);
  },
};
