export default {
  name: "verify:equipment-bulk-update-rls-where",
  run(ctx) {
    ctx.run("node", ["scripts/verify-equipment-bulk-update-rls-where.mjs"]);
  },
};
