export default {
  name: "verify:migration-empty-db-safe",
  run(ctx) {
    ctx.run("node", ["scripts/verify-migration-empty-db-safe.mjs"]);
  },
};
