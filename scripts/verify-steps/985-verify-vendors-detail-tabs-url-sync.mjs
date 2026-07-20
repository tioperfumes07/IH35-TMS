export default {
  name: "verify:vendors-detail-tabs-url-sync",
  run(ctx) {
    ctx.run("node", ["scripts/verify-vendors-detail-tabs-url-sync.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-vendors-detail-tabs-url-sync.mjs"]);
  },
};
