export default {
  name: "verify:legal-matter-detail-tabs-url-sync",
  run(ctx) {
    ctx.run("node", ["scripts/verify-legal-matter-detail-tabs-url-sync.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-legal-matter-detail-tabs-url-sync.mjs"]);
  },
};
