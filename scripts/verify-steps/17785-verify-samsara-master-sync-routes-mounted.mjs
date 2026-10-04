export default {
  name: "verify:samsara-master-sync-routes-mounted",
  run(ctx) {
    ctx.run("node", ["scripts/verify-samsara-master-sync-routes-mounted.mjs"]);
  },
};
