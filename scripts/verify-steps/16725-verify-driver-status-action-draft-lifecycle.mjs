export default {
  name: "verify:driver-status-action-draft-lifecycle",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-status-action-draft-lifecycle.mjs"]);
  },
};
