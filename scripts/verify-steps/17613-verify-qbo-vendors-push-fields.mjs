export default {
  name: "verify:qbo-vendors-push-fields",
  run(ctx) {
    ctx.run("node", ["scripts/verify-qbo-vendors-push-fields.mjs"]);
  },
};
