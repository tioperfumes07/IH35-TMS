export default {
  name: "verify:dispatch-kanban-lanes-and-density",
  run(ctx) {
    ctx.run("node", ["scripts/verify-dispatch-kanban-lanes-and-density.mjs"]);
  },
};
