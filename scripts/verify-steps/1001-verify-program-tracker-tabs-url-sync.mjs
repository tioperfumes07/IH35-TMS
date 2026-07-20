export default {
  name: "verify:program-tracker-tabs-url-sync",
  run(ctx) {
    ctx.run("node", ["scripts/verify-program-tracker-tabs-url-sync.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-program-tracker-tabs-url-sync.mjs"]);
  },
};
