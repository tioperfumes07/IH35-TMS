export default {
  name: "verify:dispatcher-safety-event-edit-void-immutable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-dispatcher-safety-event-edit-void-immutable.mjs"]);
  },
};
