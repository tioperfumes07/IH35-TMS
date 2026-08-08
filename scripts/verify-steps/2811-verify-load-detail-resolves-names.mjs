export default {
  name: "verify:load-detail-resolves-names",
  run(ctx) {
    ctx.run("node", ["scripts/verify-load-detail-resolves-names.mjs"]);
  },
};
