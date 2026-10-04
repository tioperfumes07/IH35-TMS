export default {
  name: "verify:driver-safety-event-edit-void-immutable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-safety-event-edit-void-immutable.mjs"]);
  },
};
