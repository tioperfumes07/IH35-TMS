export default {
  name: "verify:dispatch-board-unassigned-units-error-state",
  run(ctx) {
    ctx.run("node", ["scripts/verify-dispatch-board-unassigned-units-error-state.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-dispatch-board-unassigned-units-error-state.mjs"]);
  },
};
