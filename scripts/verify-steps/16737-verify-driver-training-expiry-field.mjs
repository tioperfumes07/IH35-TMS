export default {
  name: "verify:driver-training-expiry-field",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-training-expiry-field.mjs"]);
  },
};
