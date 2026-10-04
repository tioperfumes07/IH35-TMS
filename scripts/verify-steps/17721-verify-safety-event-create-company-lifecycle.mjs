export default {
  name: "verify:safety-event-create-company-lifecycle",
  run(ctx) {
    ctx.run("node", ["scripts/verify-safety-event-create-company-lifecycle.mjs"]);
  },
};
