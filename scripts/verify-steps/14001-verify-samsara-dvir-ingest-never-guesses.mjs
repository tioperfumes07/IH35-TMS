export default {
  name: "verify:samsara-dvir-ingest-never-guesses",
  run(ctx) {
    ctx.run("node", ["scripts/verify-samsara-dvir-ingest-never-guesses.mjs"]);
  },
};
