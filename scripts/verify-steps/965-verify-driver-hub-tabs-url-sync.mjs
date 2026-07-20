export default {
  name: "verify:driver-hub-tabs-url-sync",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-hub-tabs-url-sync.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-driver-hub-tabs-url-sync.mjs"]);
  },
};
