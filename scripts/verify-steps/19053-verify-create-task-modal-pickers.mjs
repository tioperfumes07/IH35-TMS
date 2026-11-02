export default {
  name: "verify:create-task-modal-pickers",
  run(ctx) {
    ctx.run("node", ["scripts/verify-create-task-modal-pickers.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-create-task-modal-pickers.mjs"]);
  },
};
