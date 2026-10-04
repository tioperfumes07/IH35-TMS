export default {
  name: "verify:backend-schema-contract",
  run(ctx) {
    ctx.run("node", ["scripts/verify-backend-schema-contract.mjs"]);
  },
};
