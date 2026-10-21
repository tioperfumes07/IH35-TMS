export default {
  name: "verify:relay-ingest-lookback",
  run(ctx) {
    ctx.run("node", ["scripts/verify-relay-ingest-lookback.mjs"]);
  },
};
