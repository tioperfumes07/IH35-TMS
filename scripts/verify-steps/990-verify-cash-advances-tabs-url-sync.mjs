export default {
  name: "verify:cash-advances-tabs-url-sync",
  run(ctx) {
    ctx.run("node", ["scripts/verify-cash-advances-tabs-url-sync.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-cash-advances-tabs-url-sync.mjs"]);
  },
};
