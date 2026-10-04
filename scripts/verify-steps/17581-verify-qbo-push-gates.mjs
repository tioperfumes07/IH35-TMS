export default {
  name: "verify:qbo-push-gates",
  run(ctx) {
    ctx.run("node", ["scripts/verify-qbo-push-gates.mjs"]);
  },
};
