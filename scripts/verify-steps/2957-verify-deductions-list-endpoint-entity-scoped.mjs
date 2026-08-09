export default {
  name: "verify:deductions-list-endpoint-entity-scoped",
  run(ctx) {
    ctx.run("node", ["scripts/verify-deductions-list-endpoint-entity-scoped.mjs"]);
  },
};
