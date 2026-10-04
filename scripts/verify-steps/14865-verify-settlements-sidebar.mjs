export default {
  name: "verify:settlements-sidebar",
  run(ctx) {
    ctx.run("node", ["scripts/verify-settlements-sidebar.mjs"]);
  },
};
