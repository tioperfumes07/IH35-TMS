export default {
  name: "verify:dispatch-board-hos-columns",
  run(ctx) {
    ctx.run("node", ["scripts/verify-dispatch-board-hos-columns.mjs"]);
  },
};
