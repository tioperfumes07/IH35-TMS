export default {
  name: "verify:create-advance-modal-error-state",
  run(ctx) {
    ctx.run("node", ["scripts/verify-create-advance-modal-error-state.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-create-advance-modal-error-state.mjs"]);
  },
};
