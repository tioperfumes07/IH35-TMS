export default {
  name: "verify:document-alerts-tabs-url-sync",
  run(ctx) {
    ctx.run("node", ["scripts/verify-document-alerts-tabs-url-sync.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-document-alerts-tabs-url-sync.mjs"]);
  },
};
