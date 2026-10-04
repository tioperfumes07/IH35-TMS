export default {
  name: "verify:e29-fences-fire-and-status-switch-flag-off",
  run(ctx) {
    ctx.run("node", ["scripts/verify-e29-fences-fire-and-status-switch-flag-off.mjs"]);
  },
};
