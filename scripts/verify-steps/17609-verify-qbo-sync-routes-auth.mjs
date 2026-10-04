export default {
  name: "verify:qbo-sync-routes-auth",
  run(ctx) {
    ctx.run("node", ["scripts/verify-qbo-sync-routes-auth.mjs"]);
  },
};
