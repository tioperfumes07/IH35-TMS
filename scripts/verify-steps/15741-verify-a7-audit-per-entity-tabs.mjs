export default {
  name: "verify:a7-audit-per-entity-tabs",
  run(ctx) {
    ctx.run("node", ["scripts/verify-a7-audit-per-entity-tabs.mjs"]);
  },
};
