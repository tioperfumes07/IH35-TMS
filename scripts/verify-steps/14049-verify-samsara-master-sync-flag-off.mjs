export default {
  name: "verify:samsara-master-sync-flag-off",
  run(ctx) {
    ctx.run("node", ["scripts/verify-samsara-master-sync-flag-off.mjs"]);
  },
};
