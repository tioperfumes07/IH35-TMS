export default {
  name: "verify:ent-audit-all-entity-types",
  run(ctx) {
    ctx.run("node", ["scripts/verify-ent-audit-all-entity-types.mjs"]);
  },
};
