export default {
  name: "verify:unit-plate-create-company-identity",
  run(ctx) {
    ctx.run("node", ["scripts/verify-unit-plate-create-company-identity.mjs"]);
  },
};
