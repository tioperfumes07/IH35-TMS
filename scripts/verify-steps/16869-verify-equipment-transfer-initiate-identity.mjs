export default {
  name: "verify:equipment-transfer-initiate-identity",
  run(ctx) {
    ctx.run("node", ["scripts/verify-equipment-transfer-initiate-identity.mjs"]);
  },
};
