// dispatch-sweep-gap-21 residual — Dispatcher Home active-loads invoice reverse linkage.
// Rule 17: verify-*.mjs + verify-steps only (no package.json / CI workflow edits).
export default {
  name: "dispatcher-home-invoice-status",
  run(ctx) {
    ctx.run("node", ["scripts/verify-dispatcher-home-invoice-status.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-dispatcher-home-invoice-status.mjs"]);
  },
};
