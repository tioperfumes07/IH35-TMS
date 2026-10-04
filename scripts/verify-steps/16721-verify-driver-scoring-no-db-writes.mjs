export default {
  name: "verify:driver-scoring-no-db-writes",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-scoring-no-db-writes.mjs"]);
  },
};
