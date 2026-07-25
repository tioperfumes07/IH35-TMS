export default {
  name: "verify-bank-surf-entry-tabs",
  run(ctx) {
    ctx.run("node", ["scripts/verify-bank-surf-entry-tabs.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-bank-surf-entry-tabs.mjs"]);
  },
};
