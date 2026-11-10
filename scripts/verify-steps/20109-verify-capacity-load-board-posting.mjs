export default {
  name: "verify:capacity-load-board-posting",
  run(ctx) {
    ctx.run("node", ["scripts/verify-capacity-load-board-posting.mjs"]);
    ctx.run("node", ["scripts/verify-capacity-load-board-posting.mjs", "--selftest"]);
  },
};
