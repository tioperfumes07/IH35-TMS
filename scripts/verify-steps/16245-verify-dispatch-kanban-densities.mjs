export default {
  name: "verify:dispatch-kanban-densities",
  run(ctx) {
    ctx.run("node", ["scripts/verify-dispatch-kanban-densities.mjs"]);
  },
};
