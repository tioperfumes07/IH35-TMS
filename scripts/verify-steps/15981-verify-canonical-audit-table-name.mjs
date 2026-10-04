export default {
  name: "verify:canonical-audit-table-name",
  run(ctx) {
    ctx.run("node", ["scripts/verify-canonical-audit-table-name.mjs"]);
  },
};
