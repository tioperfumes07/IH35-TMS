export default {
  name: "verify:dispatch-list-orphaned",
  run(ctx) {
    ctx.run("node", ["scripts/verify-dispatch-list-orphaned.mjs"]);
  },
};
