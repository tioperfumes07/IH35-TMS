export default {
  name: "verify:financial-statements-tabs-url-sync",
  run(ctx) {
    ctx.run("node", ["scripts/verify-financial-statements-tabs-url-sync.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-financial-statements-tabs-url-sync.mjs"]);
  },
};
