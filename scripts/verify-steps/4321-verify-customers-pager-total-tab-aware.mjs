export default {
  name: "verify:customers-pager-total-tab-aware",
  run(ctx) {
    ctx.run("node", ["scripts/verify-customers-pager-total-tab-aware.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-customers-pager-total-tab-aware.mjs"]);
  },
};
