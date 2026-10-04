export default {
  name: "verify:wo-audit-entity-type",
  run(ctx) {
    ctx.run("node", ["scripts/verify-wo-audit-entity-type.mjs"]);
  },
};
