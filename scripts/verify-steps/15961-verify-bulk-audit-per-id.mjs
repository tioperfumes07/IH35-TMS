export default {
  name: "verify:bulk-audit-per-id",
  run(ctx) {
    ctx.run("node", ["scripts/verify-bulk-audit-per-id.mjs"]);
  },
};
