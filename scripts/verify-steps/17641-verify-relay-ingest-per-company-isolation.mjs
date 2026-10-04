export default {
  name: "verify:relay-ingest-per-company-isolation",
  run(ctx) {
    ctx.run("node", ["scripts/verify-relay-ingest-per-company-isolation.mjs"]);
  },
};
