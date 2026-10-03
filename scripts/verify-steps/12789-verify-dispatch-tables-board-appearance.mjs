export default {
  name: "verify:dispatch-tables-board-appearance",
  run(ctx) {
    ctx.run("node", ["scripts/verify-dispatch-tables-board-appearance.mjs"]);
  },
};
