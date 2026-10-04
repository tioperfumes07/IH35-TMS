export default {
  name: "verify:internal-labor-create-identity",
  run(ctx) {
    ctx.run("node", ["scripts/verify-internal-labor-create-identity.mjs"]);
  },
};
