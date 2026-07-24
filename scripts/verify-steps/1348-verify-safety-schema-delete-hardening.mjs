export default {
  name: "verify:safety-schema-delete-hardening",
  run(ctx) {
    return ctx.run("node", ["scripts/verify-safety-schema-delete-hardening.mjs"]);
  },
};
