export default {
  name: "verify:master-detail-selected-row-url-addressable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-master-detail-selected-row-url-addressable.mjs"]);
  },
};
