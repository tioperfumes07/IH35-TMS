export default {
  name: "verify:equipment-plate-create-company-identity",
  run(ctx) {
    ctx.run("node", ["scripts/verify-equipment-plate-create-company-identity.mjs"]);
  },
};
