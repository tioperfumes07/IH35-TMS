export default {
  name: "verify:factoring-index-tabs-url-sync",
  run(ctx) {
    ctx.run("node", ["scripts/verify-factoring-index-tabs-url-sync.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-factoring-index-tabs-url-sync.mjs"]);
  },
};
