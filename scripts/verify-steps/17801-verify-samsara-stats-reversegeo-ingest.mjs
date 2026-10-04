export default {
  name: "verify:samsara-stats-reversegeo-ingest",
  run(ctx) {
    ctx.run("node", ["scripts/verify-samsara-stats-reversegeo-ingest.mjs"]);
  },
};
