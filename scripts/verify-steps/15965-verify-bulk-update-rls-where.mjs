export default {
  name: "verify:bulk-update-rls-where",
  run(ctx) {
    ctx.run("node", ["scripts/verify-bulk-update-rls-where.mjs"]);
  },
};
