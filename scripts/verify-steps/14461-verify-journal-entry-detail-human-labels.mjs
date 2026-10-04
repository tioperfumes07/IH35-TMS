export default {
  name: "verify:journal-entry-detail-human-labels",
  run(ctx) {
    ctx.run("node", ["scripts/verify-journal-entry-detail-human-labels.mjs"]);
  },
};
