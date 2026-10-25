export default {
  name: "verify:settlements-home-board",
  run(ctx) {
    ctx.run("node", ["scripts/verify-settlements-home-board.mjs"]);
  },
};
