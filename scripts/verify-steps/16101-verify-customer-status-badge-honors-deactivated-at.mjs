export default {
  name: "verify:customer-status-badge-honors-deactivated-at",
  run(ctx) {
    ctx.run("node", ["scripts/verify-customer-status-badge-honors-deactivated-at.mjs"]);
  },
};
