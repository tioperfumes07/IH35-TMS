export default {
  name: "verify:auth-gate-panel-fails-closed",
  run(ctx) {
    ctx.run("node", ["scripts/verify-auth-gate-panel-fails-closed.mjs"]);
  },
};
