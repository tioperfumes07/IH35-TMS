export default {
  name: "verify:entity-label-rejects-serialized-json",
  run(ctx) {
    ctx.run("node", ["scripts/verify-entity-label-rejects-serialized-json.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-entity-label-rejects-serialized-json.mjs"]);
  },
};
