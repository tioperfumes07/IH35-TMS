export default {
  name: "verify:factoring-sidebar-nav",
  run(ctx) {
    ctx.run("node", ["scripts/verify-factoring-sidebar-nav.mjs"]);
  },
};
