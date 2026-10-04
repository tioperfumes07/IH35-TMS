export default {
  name: "verify:samsara-sync-tenant-context",
  run(ctx) {
    ctx.run("node", ["scripts/verify-samsara-sync-tenant-context.mjs"]);
  },
};
