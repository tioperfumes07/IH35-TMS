export default {
  name: "verify:samsara-master-sync-link-only",
  run(ctx) {
    ctx.run("node", ["scripts/verify-samsara-master-sync-link-only.mjs"]);
  },
};
