export default {
  name: "verify:equipment-create-company-fk-identity",
  run(ctx) {
    ctx.run("node", ["scripts/verify-equipment-create-company-fk-identity.mjs"]);
  },
};
