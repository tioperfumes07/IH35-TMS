export default {
  name: "verify:no-sidebar-flyout",
  run(ctx) {
    ctx.run("node", ["scripts/verify-no-sidebar-flyout.mjs"]);
  },
};
