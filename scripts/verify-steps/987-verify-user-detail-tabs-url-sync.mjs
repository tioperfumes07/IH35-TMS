export default {
  name: "verify:user-detail-tabs-url-sync",
  run(ctx) {
    ctx.run("node", ["scripts/verify-user-detail-tabs-url-sync.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-user-detail-tabs-url-sync.mjs"]);
  },
};
