export default {
  name: "verify:customers-detail-tabs-url-sync",
  run(ctx) {
    ctx.run("node", ["scripts/verify-customers-detail-tabs-url-sync.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-customers-detail-tabs-url-sync.mjs"]);
  },
};
