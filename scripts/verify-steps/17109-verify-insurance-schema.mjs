export default {
  name: "verify:insurance-schema",
  run(ctx) {
    ctx.run("node", ["scripts/verify-insurance-schema.mjs"]);
  },
};
