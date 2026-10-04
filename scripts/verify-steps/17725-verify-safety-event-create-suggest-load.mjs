export default {
  name: "verify:safety-event-create-suggest-load",
  run(ctx) {
    ctx.run("node", ["scripts/verify-safety-event-create-suggest-load.mjs"]);
  },
};
