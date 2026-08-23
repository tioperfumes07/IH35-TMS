export default {
  name: "verify:owner-override-log-route-wired",
  run(ctx) {
    ctx.run("node", ["scripts/verify-owner-override-log-route-wired.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-owner-override-log-route-wired.mjs"]);
  },
};
