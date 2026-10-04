export default {
  name: "verify:factoring-advance-drawer-linkage",
  run(ctx) {
    ctx.run("node", ["scripts/verify-factoring-advance-drawer-linkage.mjs"]);
  },
};
