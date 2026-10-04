export default {
  name: "verify:create-wo-modal-contract",
  run(ctx) {
    ctx.run("node", ["scripts/verify-create-wo-modal-contract.mjs"]);
  },
};
