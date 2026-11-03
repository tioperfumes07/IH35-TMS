export default {
  name: "verify-customer-detail-shell-tabs-filled",
  run(ctx) {
    ctx.run("node", ["scripts/verify-customer-detail-shell-tabs-filled.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-customer-detail-shell-tabs-filled.mjs"]);
  },
};
