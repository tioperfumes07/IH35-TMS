export default {
  name: "verify:driver-hub-url-tab",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-hub-url-tab.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-driver-hub-url-tab.mjs"]);
  },
};
