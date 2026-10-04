export default {
  name: "verify:qbo-vendors-push-shared-rate",
  run(ctx) {
    ctx.run("node", ["scripts/verify-qbo-vendors-push-shared-rate.mjs"]);
  },
};
