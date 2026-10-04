export default {
  name: "verify:banking-empty-state-entity-aware",
  run(ctx) {
    ctx.run("node", ["scripts/verify-banking-empty-state-entity-aware.mjs"]);
  },
};
