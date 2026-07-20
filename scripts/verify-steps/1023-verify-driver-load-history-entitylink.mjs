export default {
  name: "verify:driver-load-history-entitylink",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-load-history-entitylink.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-driver-load-history-entitylink.mjs"]);
  },
};
