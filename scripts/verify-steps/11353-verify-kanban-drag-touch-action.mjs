export default {
  name: "verify-kanban-drag-touch-action",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-kanban-drag-touch-action.mjs"]) !== 0) {
      throw new Error("verify-kanban-drag-touch-action failed");
    }
  },
};
