export default {
  name: "verify:system-tabs-url-sync",
  run(ctx) {
    ctx.run("node", ["scripts/verify-system-tabs-url-sync.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-system-tabs-url-sync.mjs"]);
  },
};
