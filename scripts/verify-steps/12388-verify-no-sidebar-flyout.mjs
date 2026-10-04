export default {
  name: "verify:no-sidebar-flyout",
  run(ctx) {
    ctx.run("node", ["scripts/verify-no-sidebar-flyout.mjs"]);
    ctx.run("node", ["scripts/verify-scrollable-nav-is-reachable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-scrollable-nav-is-reachable.mjs"]);
  },
};
