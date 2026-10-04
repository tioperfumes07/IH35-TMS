export default {
  name: "verify:banking-bulk-contract",
  run(ctx) {
    ctx.run("node", ["scripts/verify-banking-bulk-contract.mjs"]);
  },
};
