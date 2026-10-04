export default {
  name: "verify:catalog-audit-event-types-id-column",
  run(ctx) {
    ctx.run("node", ["scripts/verify-catalog-audit-event-types-id-column.mjs"]);
  },
};
