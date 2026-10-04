export default {
  name: "verify:per-entity-only-flag-gates",
  run(ctx) {
    ctx.run("node", ["scripts/verify-per-entity-only-flag-gates.mjs"]);
  },
};
