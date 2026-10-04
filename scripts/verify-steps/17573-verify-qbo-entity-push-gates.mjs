export default {
  name: "verify:qbo-entity-push-gates",
  run(ctx) {
    ctx.run("node", ["scripts/verify-qbo-entity-push-gates.mjs"]);
  },
};
