export default {
  name: "verify:unit-photo-create-company-identity",
  run(ctx) {
    ctx.run("node", ["scripts/verify-unit-photo-create-company-identity.mjs"]);
  },
};
