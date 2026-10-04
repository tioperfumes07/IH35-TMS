export default {
  name: "verify:dispatch-cancel-reason-catalog",
  run(ctx) {
    ctx.run("node", ["scripts/verify-dispatch-cancel-reason-catalog.mjs"]);
  },
};
