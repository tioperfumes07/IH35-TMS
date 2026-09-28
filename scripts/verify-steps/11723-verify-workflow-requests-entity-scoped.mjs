export default {
  name: "verify:workflow-requests-entity-scoped",
  run(ctx) {
    ctx.run("node", ["scripts/verify-workflow-requests-entity-scoped.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-workflow-requests-entity-scoped.mjs"]);
  },
};
