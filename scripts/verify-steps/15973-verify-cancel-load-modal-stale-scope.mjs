export default {
  name: "verify:cancel-load-modal-stale-scope",
  run(ctx) {
    ctx.run("node", ["scripts/verify-cancel-load-modal-stale-scope.mjs"]);
  },
};
