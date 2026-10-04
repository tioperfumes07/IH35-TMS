export default {
  name: "verify:accounting-audit-trail-lineage",
  run(ctx) {
    ctx.run("node", ["scripts/verify-accounting-audit-trail-lineage.mjs"]);
  },
};
