export default {
  name: "verify:safety-driver-document-durable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-safety-driver-document-durable.mjs"]);
  },
};
