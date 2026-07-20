export default {
  name: "verify:compliance-tabs-url-sync",
  run(ctx) {
    ctx.run("node", ["scripts/verify-compliance-tabs-url-sync.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-compliance-tabs-url-sync.mjs"]);
  },
};
