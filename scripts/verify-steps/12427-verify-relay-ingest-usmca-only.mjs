export default {
  name: "verify:relay-ingest-usmca-only",
  run(ctx) {
    ctx.run("node", ["scripts/verify-relay-ingest-usmca-only.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-relay-ingest-usmca-only.mjs"]);
  },
};
