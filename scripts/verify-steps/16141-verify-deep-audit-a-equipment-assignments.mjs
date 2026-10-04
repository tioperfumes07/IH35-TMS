export default {
  name: "verify:deep-audit-a-equipment-assignments",
  run(ctx) {
    ctx.run("node", ["scripts/verify-deep-audit-a-equipment-assignments.mjs"]);
  },
};
